import { BaseSideService } from '@zeppos/zml/base-side'

const SERVER_URL_KEY = 'serverUrl'
const API_TOKEN_KEY = 'apiToken'
const DEFAULT_SERVER_URL = 'http://localhost:3000'

AppSideService(
  BaseSideService({
    onInit() {
      console.log('app-side service initialized')
    },
    onRun() {},
    onDestroy() {
      console.log('app-side service destroyed')
    },
    onRequest(req: unknown, res: (err: unknown, data?: unknown) => void): void {
      const audioBuffer = req as ArrayBuffer
      const serverUrl = settings.settingsStorage.getItem(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL
      const apiToken = settings.settingsStorage.getItem(API_TOKEN_KEY) ?? ''

      fetch(`${serverUrl}/api/ask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: audioBuffer,
      })
        .then((response) => {
          if (!response.ok) {
            return Promise.reject(new Error(`Server error: ${response.status}`))
          }
          return response.arrayBuffer()
        })
        .then((audioResponse: ArrayBuffer) => {
          res(null, Buffer.from(audioResponse))
        })
        .catch((err: unknown) => {
          console.error('Side service request failed:', String(err))
          res(err)
        })
    },
  })
)
