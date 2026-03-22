import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { createRecorder, createPlayer } from '@zos/media'
import type { RecorderInstance, PlayerInstance } from '@zos/media'
import { openSync, readSync, writeSync, closeSync, statSync, O_RDONLY, O_RDWR, O_CREAT, O_TRUNC } from '@zos/fs'
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

// CLICK_AREA is a valid Zepp OS widget not yet included in @zeppos/device-types
const zepposWidget = hmUI.widget as typeof hmUI.widget & { readonly CLICK_AREA: number }

// Module-level state (Page.Option only accepts lifecycle methods + state object)
let appState = AppState.Idle
let recorder: RecorderInstance | null = null
let player: PlayerInstance | null = null
let stateTextWidget: ReturnType<typeof hmUI.createWidget> | null = null
let btnWidget: ReturnType<typeof hmUI.createWidget> | null = null

function setState(newState: AppState): void {
  appState = newState
  stateTextWidget?.setProperty(hmUI.prop.TEXT, STATE_LABELS[newState])
  btnWidget?.setProperty(hmUI.prop.COLOR, BTN_COLORS[newState])
}

function startPlayback(filePath: string): void {
  try {
    player = createPlayer()
    player.prepare()
    player.setSource({ filePath })
    player.addEventListener('play_end', () => {
      logger.debug('playback ended')
      player = null
      setState(AppState.Idle)
    })
    player.addEventListener('play_error', (result) => {
      logger.error('playback error: ' + JSON.stringify(result))
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
  // Guard: only send if we just finished recording
  if (appState !== AppState.Recording) return
  setState(AppState.Sending)

  // Read the recorded audio file into an ArrayBuffer
  const stat = statSync({ path: RECORDING_FILE })
  if (!stat) {
    logger.error('recording file not found')
    setState(AppState.Idle)
    return
  }
  const audioBuffer = new ArrayBuffer(stat.size)
  const fd = openSync({ path: RECORDING_FILE, flag: O_RDONLY })
  readSync({ fd, buffer: audioBuffer })
  closeSync({ fd })

  // Send audio to Side Service via BLE messaging (BaseApp sets up .request())
  const appRequest = getApp()._options.request as (data: ArrayBuffer) => Promise<Uint8Array>
  appRequest(audioBuffer)
    .then((responseData: Uint8Array) => {
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
  sendToSideService()
}

function startRecording(): void {
  try {
    recorder = createRecorder()
    recorder.prepare()
    recorder.setFormat({ codec: 'OPUS', sampleRate: 16000, filePath: RECORDING_PATH })
    recorder.addEventListener('record_end', () => {
      logger.debug('recording ended')
      sendToSideService()
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

Page({
  onInit() {
    logger.debug('page onInit invoked')
  },

  build() {
    logger.debug('page build invoked')

    hmUI.createWidget(hmUI.widget.CIRCLE, RING_STYLE)
    btnWidget = hmUI.createWidget(hmUI.widget.CIRCLE, BTN_STYLE)
    stateTextWidget = hmUI.createWidget(hmUI.widget.TEXT, STATE_TEXT_STYLE)
    hmUI.createWidget(zepposWidget.CLICK_AREA, {
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
    appState = AppState.Idle
  },
})
