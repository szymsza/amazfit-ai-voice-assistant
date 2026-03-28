export function assets(type: string) {
  return (path: string) => type + '/' + path
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let result = ''
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < len ? bytes[i + 1] : 0
    const b2 = i + 2 < len ? bytes[i + 2] : 0
    result += B64_CHARS[b0 >> 2]
    result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)]
    result += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '='
    result += i + 2 < len ? B64_CHARS[b2 & 63] : '='
  }
  return result
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const lookup = new Uint8Array(128)
  for (let i = 0; i < B64_CHARS.length; i++) lookup[B64_CHARS.charCodeAt(i)] = i
  const len = b64.length
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  const out = new Uint8Array((len * 3) / 4 - padding)
  let j = 0
  for (let i = 0; i < len; i += 4) {
    const e0 = lookup[b64.charCodeAt(i)]
    const e1 = lookup[b64.charCodeAt(i + 1)]
    const e2 = lookup[b64.charCodeAt(i + 2)]
    const e3 = lookup[b64.charCodeAt(i + 3)]
    out[j++] = (e0 << 2) | (e1 >> 4)
    if (j < out.length) out[j++] = ((e1 & 15) << 4) | (e2 >> 2)
    if (j < out.length) out[j++] = ((e2 & 3) << 6) | e3
  }
  return out.buffer
}
