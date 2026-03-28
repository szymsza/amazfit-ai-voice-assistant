console.log('[side] module loaded')
import { BaseSideService } from '@zeppos/zml/base-side'
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/index'

const SERVER_URL_KEY = 'serverUrl'
const API_TOKEN_KEY = 'apiToken'
const DEFAULT_SERVER_URL = 'http://localhost:3000'
const DEFAULT_API_TOKEN = 'your_secret_token_here'

// Register shake handler before ZML sets up its peerSocket listener.
// ZML's onMessage() can't handle raw BIN shake packets, so we respond ourselves.
// Header layout (from ZML buildBin): flag(1), version(1), type uint16LE(2),
// port1 uint16LE(2), port2 uint16LE(2), appId uint32LE(4), extra uint32LE(4), payload...
function buildShakeResponse(shakeBuf: ZeppBuffer): ZeppBuffer {
  const devicePort = shakeBuf[4] | (shakeBuf[5] << 8)
  const appId =
    shakeBuf[8] | (shakeBuf[9] << 8) | (shakeBuf[10] << 16) | (shakeBuf[11] << 24)
  const resp = Buffer.alloc(17) // 16-byte header + 1 byte payload
  resp[0] = 1;  resp[1] = 1           // flag=1, version=1
  resp[2] = 1;  resp[3] = 0           // type=1 (Shake) as uint16 LE
  resp[4] = 1;  resp[5] = 0           // port1=1 (side service port)
  resp[6] = devicePort & 0xFF;  resp[7] = (devicePort >> 8) & 0xFF  // port2=device port
  resp[8]  = appId & 0xFF;       resp[9]  = (appId >> 8) & 0xFF
  resp[10] = (appId >> 16) & 0xFF; resp[11] = (appId >> 24) & 0xFF
  resp[12] = resp[13] = resp[14] = resp[15] = 0  // extra=0
  resp[16] = appId & 0xFF  // payload: low byte of appId
  return resp
}

function shakeMessageHandler(msg: unknown): void {
  const buf = Buffer.from(msg as ArrayBuffer)
  // Detect shake: flag=1 (byte 0), type=1 as uint16LE (bytes 2-3=0x01,0x00), min 16 bytes
  if (buf.byteLength >= 16 && buf[0] === 1 && buf[2] === 1 && buf[3] === 0) {
    console.log('[side] shake detected, sending response')
    const resp = buildShakeResponse(buf)
    messaging!.peerSocket.send(resp.buffer)
  }
}

let shakeHandlerRegistered = false

function registerShakeHandler(): void {
  if (!messaging?.peerSocket) return
  // Remove before adding to avoid duplicates across hot reloads
  messaging.peerSocket.removeListener('message', shakeMessageHandler)
  messaging.peerSocket.addListener('message', shakeMessageHandler)
  shakeHandlerRegistered = true
  console.log('[side] shake handler registered')
}

// Register at module load for the initial connection
registerShakeHandler()

try {
  AppSideService(
    BaseSideService({
      onInit() {
        console.log('[side] onInit called')
        registerShakeHandler()
      },
      onRun() {
        // Re-register on each run to handle hot reload / device reconnect
        registerShakeHandler()
      },
      onDestroy() {
        console.log('[side] onDestroy called')
      },
      onRequest(req: unknown, res: (err: unknown, data?: unknown) => void): void {
        const b64 = req as string
        console.log('[side] onRequest called, base64 length:', b64?.length ?? 'unknown')

        // Decode base64 → binary (ZML can't send raw ArrayBuffer from watch side)
        const audioBuffer = base64ToArrayBuffer(b64)
        console.log('[side] decoded audio size:', audioBuffer.byteLength)

        const serverUrl = settings.settingsStorage.getItem(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL
        const apiToken = settings.settingsStorage.getItem(API_TOKEN_KEY) ?? DEFAULT_API_TOKEN

        fetch(`${serverUrl}/api/ask`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/octet-stream' },
          body: audioBuffer,
        })
          .then((response) => {
            console.log('[side] fetch response status:', response.status)
            if (!response.ok) {
              return Promise.reject(new Error(`Server error: ${response.status}`))
            }
            return response.arrayBuffer()
          })
          .then((audioResponse: ArrayBuffer) => {
            // Base64-encode response so ZML can carry it back as a string
            const b64Response = arrayBufferToBase64(audioResponse)
            console.log('[side] sending response, base64 length:', b64Response.length)
            res(null, b64Response)
          })
          .catch((err: unknown) => {
            console.error('[side] request failed:', String(err))
            res(err)
          })
      },
    })
  )
} catch (e) {
  console.error('[side] AppSideService setup threw:', String(e))
}
