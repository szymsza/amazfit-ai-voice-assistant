import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { create, id as mediaId, codec as mediaCodec } from '@zos/media'
import type { MediaInstance } from '@zos/media'
import { openSync, readSync, writeSync, closeSync, statSync, O_RDONLY, O_RDWR, O_CREAT, O_TRUNC } from '@zos/fs'
import { getTestAudioBuffer } from '../../../utils/testAudio'
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

function startPlayback(filePath: string): void {
  try {
    player = create(mediaId.PLAYER)
    player.prepare({ src: filePath })
    player.addEventListener('complete', () => {
      logger.debug('playback ended')
      player = null
      setState(AppState.Idle)
    })
    player.start()
    setState(AppState.Playing)
  } catch (e) {
    logger.error('player start failed: ' + (e as Error).message)
    player = null
    setState(AppState.Idle)
  }
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

  logger.debug('calling requestFn, buffer size: ' + audioBuffer.byteLength)
  // Send audio to Side Service via BLE (BasePage provides this.request via requestFn)
  requestFn!(audioBuffer)
    .then((responseData: Uint8Array) => {
      logger.debug('got response, size: ' + responseData.byteLength)
      // Write response audio to file so Player can read it
      const ab = responseData.buffer.slice(
        responseData.byteOffset,
        responseData.byteOffset + responseData.byteLength
      ) as ArrayBuffer
      const wfd = openSync({ path: RESPONSE_FILE, flag: O_RDWR | O_CREAT | O_TRUNC })
      writeSync({ fd: wfd, buffer: ab })
      closeSync({ fd: wfd })
      startPlayback(RESPONSE_PATH)
    })
    .catch((err: unknown) => {
      logger.error('side service request failed: ' + String(err))
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
    logger.debug('RECORDER=' + mediaId.RECORDER + ' PLAYER=' + mediaId.PLAYER + ' OPUS=' + mediaCodec.OPUS + ' AAC=' + mediaCodec.AAC)
    recorder = create(mediaId.RECORDER)
    logger.debug('recorder type=' + typeof recorder + ' keys=' + Object.keys(recorder as object).join(','))
    recorder.setFormat(mediaCodec.OPUS, { target_file: RECORDING_PATH })
    logger.debug('setFormat called')
    recorder.addEventListener('complete', () => {
      logger.debug('recording complete event fired')
      recorder = null
    })
    recorder.start()
    setState(AppState.Recording)
  } catch (e) {
    logger.error('recorder start failed: ' + (e as Error).message)
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
    logger.debug('page onInit invoked')
  },

  build() {
    logger.debug('page build invoked')

    hmUI.createWidget(hmUI.widget.CIRCLE, RING_STYLE)
    btnWidget = hmUI.createWidget(hmUI.widget.CIRCLE, BTN_STYLE)
    stateTextWidget = hmUI.createWidget(hmUI.widget.TEXT, STATE_TEXT_STYLE)
    hmUI.createWidget(hmUI.widget.BUTTON, {
      ...CLICK_AREA_STYLE,
      click_func: onButtonPress,
    })
  },

  onDestroy() {
    logger.debug('page onDestroy invoked')
    if (recorder) {
      try { recorder.stop() } catch (_) { /* already stopped */ }
      recorder = null
    }
    if (player) {
      try { player.stop() } catch (_) { /* already stopped */ }
      player = null
    }
    stateTextWidget = null
    btnWidget = null
    requestFn = null
    appState = AppState.Idle
  },
}))
