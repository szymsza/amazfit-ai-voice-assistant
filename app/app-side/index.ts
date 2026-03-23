console.log('[side] module loaded')
import { BaseSideService } from '@zeppos/zml/base-side'

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

if (messaging?.peerSocket) {
  messaging.peerSocket.addListener('message', (msg: unknown) => {
    const buf = Buffer.from(msg as ArrayBuffer)
    // Detect shake: flag=1 (byte 0), type=1 as uint16LE (bytes 2-3=0x01,0x00), min 16 bytes
    if (buf.byteLength >= 16 && buf[0] === 1 && buf[2] === 1 && buf[3] === 0) {
      console.log('[side] shake detected, sending response')
      const resp = buildShakeResponse(buf)
      messaging!.peerSocket.send(resp.buffer)
    }
  })
  console.log('[side] shake handler registered')
} else {
  console.log('[side] messaging not available at module load')
}

try {
  AppSideService(
    BaseSideService({
      onInit() {
        console.log('[side] onInit called')
      },
      onRun() {},
      onDestroy() {
        console.log('[side] onDestroy called')
      },
      onRequest(req: unknown, res: (err: unknown, data?: unknown) => void): void {
        console.log('[side] onRequest called, payload size:', (req as ArrayBuffer)?.byteLength ?? 'unknown')
        const audioBuffer = req as ArrayBuffer
        const serverUrl = settings.settingsStorage.getItem(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL
        const apiToken = settings.settingsStorage.getItem(API_TOKEN_KEY) ?? DEFAULT_API_TOKEN

        fetch(`${serverUrl}/api/ask`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}` },
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
            console.log('[side] sending response, size:', audioResponse.byteLength)
            res(null, Buffer.from(audioResponse))
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
