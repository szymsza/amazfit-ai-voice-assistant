import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { create, id as mediaId, codec as mediaCodec } from '@zos/media'
import type { MediaInstance } from '@zos/media'
import { openSync, readSync, writeSync, closeSync, statSync, O_RDONLY, O_RDWR, O_CREAT, O_TRUNC } from '@zos/fs'
import { getTestAudioBuffer } from '../../../utils/testAudio'
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../../utils/index'
import { BasePage, BasePageThis } from '@zeppos/zml/base-page'
import {
  RING_STYLE,
  BTN_STYLE,
  CLICK_AREA_STYLE,
  STATE_TEXT_STYLE,
} from 'zosLoader:./index.page.[pf].layout.js'

const logger = Logger.getLogger('ai-voice-assistant')

const enum AppState {
  Idle = 'idle',
  Recording = 'recording',
  Sending = 'sending',
  Waiting = 'waiting',
  Receiving = 'receiving',
  Playing = 'playing',
}

const STATE_LABELS: Record<AppState, string> = {
  [AppState.Idle]: 'Tap to record',
  [AppState.Recording]: 'Recording...',
  [AppState.Sending]: 'Sending...',
  [AppState.Waiting]: 'Waiting...',
  [AppState.Receiving]: 'Receiving...',
  [AppState.Playing]: 'Playing...',
}

const BTN_COLORS: Record<AppState, number> = {
  [AppState.Idle]: 0xe63946,
  [AppState.Recording]: 0xff2244,
  [AppState.Sending]: 0x888888,
  [AppState.Waiting]: 0xffa500,
  [AppState.Receiving]: 0x4caf50,
  [AppState.Playing]: 0x2196f3,
}

// data:// paths used by Recorder/Player APIs
const RECORDING_PATH = 'data://recording.opus'
const RESPONSE_PATH = 'data://response.opus'

// relative paths used by @zos/fs (relative to the app /data directory)
const RECORDING_FILE = 'recording.opus'
const RESPONSE_FILE = 'response.opus'

// Module-level state (Page.Option only accepts lifecycle methods + state object)
let appState = AppState.Idle
let recorder: MediaInstance | null = null
let player: MediaInstance | null = null
let stateTextWidget: ReturnType<typeof hmUI.createWidget> | null = null
let btnWidget: ReturnType<typeof hmUI.createWidget> | null = null
let requestFn: ((data: ArrayBuffer) => Promise<Uint8Array>) | null = null

function setState(newState: AppState): void {
  appState = newState
  stateTextWidget?.setProperty(hmUI.prop.TEXT, STATE_LABELS[newState])
  btnWidget?.setProperty(hmUI.prop.COLOR, BTN_COLORS[newState])
}

function initMediaInstances(): void {
  recorder = create(mediaId.RECORDER)
  if (!recorder) {
    logger.error('recorder create returned null/undefined')
  }

  player = create(mediaId.PLAYER)
  if (!player) {
    logger.error('player create returned null/undefined')
    return
  }

  player.addEventListener(player.event.PREPARE, (result: unknown) => {
    logger.debug('PREPARE event fired, result=' + String(result))
    if (result) {
      logger.debug('prepare succeeded, calling start()')
      player!.start()
    } else {
      logger.error('prepare failed (result=' + String(result) + '), going idle')
      setState(AppState.Idle)
    }
  })

  player.addEventListener(player.event.COMPLETE, () => {
    logger.debug('COMPLETE event fired, calling stop()')
    player!.stop()
    setState(AppState.Idle)
  })
}

function startPlayback(fileName: string): void {
  if (!player) {
    logger.error('player not initialized')
    setState(AppState.Idle)
    return
  }
  logger.debug('startPlayback: ' + fileName)
  const setSourceResult = player.setSource(player.source.FILE, { file: fileName })
  logger.debug('setSource result=' + String(setSourceResult))
  const prepareResult = player.prepare()
  logger.debug('prepare() called, result=' + String(prepareResult))
  setState(AppState.Playing)
  setTimeout(() => { if (appState === AppState.Playing) { logger.warn('playback watchdog fired: no PREPARE event, assuming simulator'); setState(AppState.Idle) } }, 500)
}

function sendToSideService(): void {
  // Guard: only send if we're in the sending state (set by stopRecording)
  if (appState !== AppState.Sending) return

  // Read the recorded audio file into an ArrayBuffer
  let audioBuffer: ArrayBuffer
  const stat = statSync({ path: RECORDING_FILE })
  if (!stat || stat.size === 0) {
    logger.warn('recording file not found or empty (size=' + (stat?.size ?? 'n/a') + ') — using test audio (simulator bypass)')
    audioBuffer = getTestAudioBuffer()
  } else {
    audioBuffer = new ArrayBuffer(stat.size)
    const fd = openSync({ path: RECORDING_FILE, flag: O_RDONLY })
    readSync({ fd, buffer: audioBuffer })
    closeSync({ fd })
  }

  logger.debug('sending audio, size=' + audioBuffer.byteLength)
  const b64Audio = arrayBufferToBase64(audioBuffer)
  requestFn!(b64Audio as unknown as ArrayBuffer)
    .then((responseData: unknown) => {
      setState(AppState.Receiving)
      const ab = base64ToArrayBuffer(responseData as string)
      logger.debug('got response, size=' + ab.byteLength)
      const wfd = openSync({ path: RESPONSE_FILE, flag: O_RDWR | O_CREAT | O_TRUNC })
      writeSync({ fd: wfd, buffer: ab })
      closeSync({ fd: wfd })
      startPlayback(RESPONSE_PATH)
    })
    .catch((err: unknown) => {
      logger.error('request failed: ' + String(err))
      setState(AppState.Idle)
    })
}

function stopRecording(): void {
  if (recorder) {
    try { recorder.stop() } catch (_) { /* may already be stopped */ }
  }
  setState(AppState.Sending)
  // Give recorder 500ms to flush the file before reading it
  setTimeout(sendToSideService, 500)
}

function startRecording(): void {
  if (!recorder) {
    logger.error('recorder not initialized')
    setState(AppState.Idle)
    return
  }
  try {
    // Truncate recording file so stale bytes from a longer previous recording aren't included
    try {
      const fd = openSync({ path: RECORDING_FILE, flag: O_RDWR | O_CREAT | O_TRUNC })
      closeSync({ fd })
    } catch (_) { /* ignore */ }
    recorder.setFormat(mediaCodec.OPUS, { target_file: RECORDING_PATH })
    recorder.start()
    setState(AppState.Recording)
    logger.debug('recording started')
  } catch (e) {
    logger.error('recorder start failed: ' + String(e))
    setState(AppState.Idle)
  }
}

function onButtonPress(): void {
  if (appState === AppState.Idle) {
    startRecording()
  } else if (appState === AppState.Recording) {
    stopRecording()
  }
}

Page(BasePage({
  onInit(this: BasePageThis) {
    requestFn = (data: ArrayBuffer) => this.request(data)
    logger.debug('page onInit')
    initMediaInstances()
  },

  onCall(data: unknown) {
    const d = data as { method: string; params: { state: string } }
    if (d?.method === 'stateUpdate') {
      logger.debug('onCall stateUpdate: ' + d.params.state)
      setState(d.params.state as AppState)
    }
  },

  build() {
    hmUI.createWidget(hmUI.widget.CIRCLE, RING_STYLE)
    btnWidget = hmUI.createWidget(hmUI.widget.CIRCLE, BTN_STYLE)
    stateTextWidget = hmUI.createWidget(hmUI.widget.TEXT, STATE_TEXT_STYLE)
    hmUI.createWidget(hmUI.widget.BUTTON, {
      ...CLICK_AREA_STYLE,
      click_func: onButtonPress,
    })
  },

  onDestroy() {
    logger.debug('page onDestroy')
    if (recorder) {
      try { recorder.stop() } catch (_) { /* already stopped */ }
      try { recorder.release() } catch (_) { /* ignore */ }
      recorder = null
    }
    if (player) {
      try { player.stop() } catch (_) { /* already stopped */ }
      try { player.release() } catch (_) { /* ignore */ }
      player = null
    }
    stateTextWidget = null
    btnWidget = null
    requestFn = null
    appState = AppState.Idle
  },
}))
