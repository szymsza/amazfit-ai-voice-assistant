import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { createRecorder } from '@zos/media'
import type { RecorderInstance } from '@zos/media'
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

const RECORDING_PATH = 'data://recording.opus'

// CLICK_AREA is a valid Zepp OS widget not yet included in @zeppos/device-types
const zepposWidget = hmUI.widget as typeof hmUI.widget & { readonly CLICK_AREA: number }

// Module-level state (Page.Option only accepts lifecycle methods + state object)
let appState = AppState.Idle
let recorder: RecorderInstance | null = null
let stateTextWidget: ReturnType<typeof hmUI.createWidget> | null = null
let btnWidget: ReturnType<typeof hmUI.createWidget> | null = null

function setState(newState: AppState): void {
  appState = newState
  stateTextWidget?.setProperty(hmUI.prop.TEXT, STATE_LABELS[newState])
  btnWidget?.setProperty(hmUI.prop.COLOR, BTN_COLORS[newState])
}

function stopRecording(): void {
  if (recorder) {
    try { recorder.stop() } catch (_) { /* may already be stopped */ }
  }
  setState(AppState.Idle)
}

function startRecording(): void {
  try {
    recorder = createRecorder()
    recorder.prepare()
    recorder.setFormat({ codec: 'OPUS', sampleRate: 16000, filePath: RECORDING_PATH })
    recorder.addEventListener('record_end', () => {
      logger.debug('recording ended')
      setState(AppState.Idle)
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
    stateTextWidget = null
    btnWidget = null
    appState = AppState.Idle
  },
})
