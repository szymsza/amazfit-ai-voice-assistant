/// <reference path="../node_modules/@zeppos/device-types/dist/index.d.ts" />

// Zepp OS runtime globals not covered by @zeppos/device-types
declare function AppSideService(option: Record<string, unknown>): void
declare function AppSettingsPage(option: Record<string, unknown>): void

// Buffer global (available in both device runtime and phone-side service runtime)
type ZeppBuffer = Uint8Array & {
  copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number
}
declare const Buffer: {
  from(input: ArrayBuffer | Uint8Array): ZeppBuffer
  from(input: string, encoding?: string): ZeppBuffer
  alloc(size: number): ZeppBuffer
  isBuffer(obj: unknown): obj is ZeppBuffer
  concat(buffers: ZeppBuffer[]): ZeppBuffer
}

// Blob global (available in phone-side service runtime)
declare class Blob {
  constructor(parts: Array<ArrayBuffer | Uint8Array | string>, options?: { type?: string }): void
}

// FormData global (available in phone-side service runtime)
declare class FormData {
  constructor(): void
  append(name: string, value: Blob | string, filename?: string): void
}

// fetch global (available in phone-side service runtime)
declare function fetch(url: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: ArrayBuffer | Uint8Array | string | FormData | null
}): Promise<{
  ok: boolean
  status: number
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
  text(): Promise<string>
}>

// messaging global (available in phone-side service runtime) - BLE peerSocket
declare const messaging: {
  peerSocket: {
    addListener(event: string, callback: (msg: unknown) => void): void
    removeListener(event: string, callback: (msg: unknown) => void): void
    send(data: ArrayBuffer): void
  }
} | undefined

// settings global (available in phone-side service runtime)
declare const settings: {
  settingsStorage: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
    clear(): void
  }
}

// @zeppos/zml/base-app: sets up BLE messaging infrastructure on device side
declare module '@zeppos/zml/base-app' {
  type BaseAppInput = {
    globalData?: Record<string, unknown>
    onCreate?: () => void
    onDestroy?: () => void
    [key: string]: unknown
  }
  function BaseApp(option: BaseAppInput): App.Option
  export { BaseApp }
}

// @zeppos/zml/base-page: provides this.request() for BLE communication with side service
declare module '@zeppos/zml/base-page' {
  interface BasePageThis {
    request(data: ArrayBuffer, opts?: Record<string, unknown>): Promise<Uint8Array>
  }
  type BasePageInput = {
    state?: Record<string, unknown>
    onInit?(this: BasePageThis): void
    build?(this: BasePageThis): void
    onDestroy?(this: BasePageThis): void
    [key: string]: unknown
  }
  function BasePage(option: BasePageInput): Record<string, unknown>
  export { BasePage, BasePageThis }
}

// @zeppos/zml/base-side: sets up BLE messaging infrastructure on phone-side service
declare module '@zeppos/zml/base-side' {
  type SideServiceInput = {
    onInit?: () => void
    onRun?: () => void
    onDestroy?: () => void
    onRequest?: (req: unknown, res: (err: unknown, data?: unknown) => void) => void
    onSettingsChange?: (change: Record<string, unknown>) => void
    [key: string]: unknown
  }
  function BaseSideService(option: SideServiceInput): Record<string, unknown>
  export { BaseSideService }
}

// Zepp OS build-time loader: re-export types from the actual round-screen layout file
declare module 'zosLoader:./index.page.[pf].layout.js' {
  export { CANVAS_STYLE, STATE_TEXT_STYLE, DEVICE_WIDTH, DEVICE_HEIGHT } from './page/gt/home/index.page.r.layout'
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
  const id: { readonly RECORDER: number; readonly PLAYER: number }
  const codec: { readonly OPUS: string; readonly AAC: string; readonly PCM: string }

  interface MediaInstance {
    setFormat(codec: string, options: Record<string, unknown>): void
    setSource(type: number, options: Record<string, unknown>): void
    prepare(options?: Record<string, unknown>): void
    start(): void
    stop(): void
    pause(): void
    resume(): void
    release(): void
    addEventListener(event: number | string, callback: (result?: unknown) => void): void
    removeEventListener(event: number | string, callback: (result?: unknown) => void): void
    readonly event: { readonly PREPARE: number; readonly COMPLETE: number; readonly PLAY: number; readonly STOP: number; readonly PAUSE: number }
    readonly source: { readonly FILE: number }
  }

  function create(type: number): MediaInstance
  export { id, codec, create, MediaInstance }
}
