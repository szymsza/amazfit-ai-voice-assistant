/// <reference path="node_modules/@zeppos/device-types/dist/index.d.ts" />

// Zepp OS runtime globals not covered by @zeppos/device-types
declare function AppSideService(option: Record<string, unknown>): void
declare function AppSettingsPage(option: Record<string, unknown>): void

// Zepp OS build-time loader: re-export types from the actual round-screen layout file
declare module 'zosLoader:./index.page.[pf].layout.js' {
  export { RING_STYLE, BTN_STYLE, CLICK_AREA_STYLE, STATE_TEXT_STYLE, DEVICE_WIDTH, DEVICE_HEIGHT } from './page/gt/home/index.page.r.layout'
}

// Add CLICK_AREA widget (valid Zepp OS widget missing from @zeppos/device-types)
declare module '@zos/ui' {
  namespace HmWearableProgram {
    namespace DeviceSide {
      namespace HmUI {
        interface IHmUIWidgetType {
          CLICK_AREA: number
        }
      }
    }
  }
}

// Zepp OS media module (recorder + player)
declare module '@zos/media' {
  export interface RecorderFormat {
    codec: 'OPUS' | 'AAC' | 'PCM'
    sampleRate?: number
    bitRate?: number
    duration?: number
    filePath: string
  }

  export interface RecorderInstance {
    prepare(): void
    setFormat(format: RecorderFormat): void
    start(): void
    stop(): void
    addEventListener(event: 'record_end' | 'record_error', callback: (result?: unknown) => void): void
    removeEventListener(event: string, callback: (result?: unknown) => void): void
    getFormat(): RecorderFormat
  }

  export interface PlayerInstance {
    prepare(): void
    setSource(source: { filePath: string }): void
    start(): void
    stop(): void
    pause(): void
    resume(): void
    addEventListener(event: 'play_end' | 'play_error', callback: (result?: unknown) => void): void
    removeEventListener(event: string, callback: (result?: unknown) => void): void
  }

  export function createRecorder(): RecorderInstance
  export function createPlayer(): PlayerInstance
}
