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
  Playing = 'playing',
}

const STATE_LABELS: Record<AppState, string> = {
  [AppState.Idle]: 'Tap to record',
  [AppState.Recording]: 'Recording...',
  [AppState.Sending]: 'Sending...',
  [AppState.Waiting]: 'Waiting...',
  [AppState.Playing]: 'Playing...',
}

const BTN_COLORS: Record<AppState, number> = {
  [AppState.Idle]: 0xe63946,
  [AppState.Recording]: 0xff2244,
  [AppState.Sending]: 0x888888,
  [AppState.Waiting]: 0x888888,
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

function startPlayback(fileName: string): void {
  const p = create(mediaId.PLAYER)
  player = p

  logger.debug('startPlayback: ' + fileName)

  p.addEventListener(p.event.PREPARE, (result: unknown) => {
    logger.debug('PREPARE result=' + String(result))
    if (result) {
      p.start()
    } else {
      logger.error('prepare failed')
      p.release()
      player = null
      setState(AppState.Idle)
    }
  })

  p.addEventListener(p.event.COMPLETE, () => {
    logger.debug('COMPLETE')
    p.stop()
    p.release()
    player = null
    setState(AppState.Idle)
  })

  p.setSource(p.source.FILE, { file: fileName })
  p.prepare()
  setState(AppState.Playing)
}

function sendToSideService(): void {
  // Guard: only send if we're in the sending state (set by stopRecording)
  if (appState !== AppState.Sending) return

  // Read the recorded audio file into an ArrayBuffer
  let audioBuffer: ArrayBuffer
  const stat = statSync({ path: RECORDING_FILE })
  if (!stat) {
    logger.warn('recording file not found — using test audio (simulator bypass)')
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
  try {
    recorder = create(mediaId.RECORDER)
    recorder.setFormat(mediaCodec.OPUS, { target_file: RECORDING_PATH })
    recorder.addEventListener('complete', () => {
      logger.debug('recording complete')
      try { recorder!.release() } catch (_) { /* ignore */ }
      recorder = null
    })
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
