import { spawnSync } from 'child_process';

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';
const DEFAULT_VOICE = 'daniel';
const TTS_MODEL = 'canopylabs/orpheus-v1-english';

const RATE = 16000;
const CHANNELS = 1;

export async function synthesizeSpeech(
  text: string,
  groqApiKey: string,
  voice: string = DEFAULT_VOICE,
): Promise<Buffer> {
  const response = await fetch(GROQ_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice,
      response_format: 'wav',
      speed: 1.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq TTS API error ${response.status}: ${errorText}`);
  }

  const wavBuffer = Buffer.from(await response.arrayBuffer());
  return wavToMp3(wavBuffer);
}

/** Convert WAV to MP3 using ffmpeg (18kbps for good quality/size balance). */
export function wavToMp3(wavBuffer: Buffer): Buffer {
  const result = spawnSync('ffmpeg', [
    '-v', 'error',
    '-i', 'pipe:0',
    '-c:a', 'libmp3lame',
    '-b:a', '18k',
    '-f', 'mp3',
    'pipe:1',
  ], { input: wavBuffer, maxBuffer: 20 * 1024 * 1024 });

  if (result.error) throw new Error(`ffmpeg spawn failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr?.toString()}`);
  return result.stdout as Buffer;
}

/**
 * Re-encode Zepp OS framed Opus: decode to PCM, then re-encode through our pipeline.
 * Used to test whether our encoder produces watch-compatible output.
 */
/**
 * Test A: Zero out padding bytes in a watch recording (keeps Opus payloads untouched).
 * Test B: Keep original headers, re-encode only the Opus payloads via OpusScript.
 */
export function testPatchWatchAudio(zeppOpus: Buffer, mode: 'zero-padding' | 're-encode-payloads'): Buffer {
  if (mode === 'zero-padding') {
    // Just zero out bytes 4-7 of each frame header
    const patched = Buffer.from(zeppOpus);
    let pos = 0;
    while (pos + 8 <= patched.length) {
      const len = patched.readUInt32BE(pos);
      if (pos + 8 + len > patched.length) break;
      patched.writeUInt32BE(0, pos + 4); // zero the padding
      pos += 8 + len;
    }
    console.log(`[tts] test zero-padding: patched ${patched.length}b`);
    return patched;
  }

  // mode === 're-encode-payloads': decode each frame then re-encode, keep original headers
  const OpusScript = require('opusscript');
  const decoder = new OpusScript(RATE, CHANNELS, OpusScript.Application.AUDIO);
  const encoder = new OpusScript(RATE, CHANNELS, OpusScript.Application.AUDIO);
  const parts: Buffer[] = [];
  let pos = 0;
  while (pos + 8 <= zeppOpus.length) {
    const len = zeppOpus.readUInt32BE(pos);
    const pad = zeppOpus.readUInt32BE(pos + 4);
    if (pos + 8 + len > zeppOpus.length) break;
    const payload = zeppOpus.subarray(pos + 8, pos + 8 + len);
    // Decode to PCM, then re-encode
    const pcm = decoder.decode(payload);
    const reencoded = Buffer.from(encoder.encode(pcm, 320));
    const header = Buffer.alloc(8);
    header.writeUInt32BE(reencoded.length, 0);
    header.writeUInt32BE(pad, 4); // keep original padding
    parts.push(header, reencoded);
    pos += 8 + len;
  }
  const out = Buffer.concat(parts);
  const toc = out.length > 8 ? out[8] : 0;
  console.log(`[tts] test re-encode-payloads: ${zeppOpus.length}b -> ${out.length}b, ${parts.length/2} frames, TOC=0x${toc.toString(16).padStart(2,'0')}`);
  return out;
}

export function reencodeZeppOpus(zeppOpus: Buffer): Buffer {
  // Decode Zepp frames to PCM using OpusScript
  const OpusScript = require('opusscript');
  const decoder = new OpusScript(RATE, CHANNELS, OpusScript.Application.AUDIO);
  const pcmParts: Buffer[] = [];
  for (let pos = 0; pos + 8 <= zeppOpus.length;) {
    const len = zeppOpus.readUInt32BE(pos);
    if (pos + 8 + len > zeppOpus.length) break;
    pcmParts.push(decoder.decode(zeppOpus.subarray(pos + 8, pos + 8 + len)));
    pos += 8 + len;
  }
  const pcm = Buffer.concat(pcmParts);
  console.log(`[tts] re-encode: decoded ${zeppOpus.length}b Zepp Opus -> ${pcm.length}b PCM`);

  // Write a minimal WAV header so wavToZeppOpus can process it
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * CHANNELS * 2, 28);
  header.writeUInt16LE(CHANNELS * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const wav = Buffer.concat([header, pcm]);

  return wavToZeppOpus(wav);
}

/**
 * Convert WAV to Zepp OS framed Opus.
 *
 * Uses ffmpeg to encode WAV → OGG/Opus (libopus, voip mode, 16kHz, 20ms frames),
 * then extracts raw Opus packets from the OGG container and wraps each one in
 * the Zepp OS frame format: [4-byte BE len][4-byte padding][opus payload].
 */
function wavToZeppOpus(wavBuffer: Buffer): Buffer {
  // Encode to OGG/Opus with ffmpeg's libopus — voip mode + low bitrate to force SILK
  const result = spawnSync('ffmpeg', [
    '-v', 'error',
    '-f', 'wav',
    '-i', 'pipe:0',
    '-c:a', 'libopus',
    '-application', 'voip',
    '-b:a', '24000',
    '-ar', String(RATE),
    '-ac', String(CHANNELS),
    '-frame_duration', '20',
    '-f', 'ogg',
    'pipe:1',
  ], { input: wavBuffer, maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw new Error(`ffmpeg spawn failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr?.toString()}`);
  const ogg = result.stdout as Buffer;

  // Extract raw Opus packets from OGG pages
  const packets = extractOggPackets(ogg);
  // Skip first 2 packets (OpusHead + OpusTags headers)
  const audioPackets = packets.slice(2);

  // Wrap in Zepp OS frame format
  const parts: Buffer[] = [];
  for (let i = 0; i < audioPackets.length; i++) {
    const pkt = audioPackets[i];
    const header = Buffer.alloc(8);
    header.writeUInt32BE(pkt.length, 0);
    header.writeUInt32BE(i + 1, 4); // non-zero padding
    parts.push(header, pkt);
  }

  const out = Buffer.concat(parts);
  if (out.length > 8) {
    const firstLen = out.readUInt32BE(0);
    const toc = out[8];
    const config = (toc >> 3) & 0x1f;
    console.log(`[tts] Zepp Opus: ${out.length}b, ${audioPackets.length} frames, first frame: len=${firstLen} TOC=0x${toc.toString(16).padStart(2, '0')} config=${config}`);
  }
  return out;
}

/** Parse OGG container and return all logical packets. */
function extractOggPackets(ogg: Buffer): Buffer[] {
  const packets: Buffer[] = [];
  let pos = 0;
  let pendingData: Buffer[] = [];

  while (pos + 27 <= ogg.length) {
    if (ogg.toString('ascii', pos, pos + 4) !== 'OggS') break;
    const numSegments = ogg[pos + 26];
    if (pos + 27 + numSegments > ogg.length) break;

    const segTable = ogg.subarray(pos + 27, pos + 27 + numSegments);
    let dataPos = pos + 27 + numSegments;

    for (let i = 0; i < numSegments; i++) {
      const segSize = segTable[i];
      pendingData.push(Buffer.from(ogg.subarray(dataPos, dataPos + segSize)));
      dataPos += segSize;
      // A segment < 255 means end of packet
      if (segSize < 255) {
        packets.push(Buffer.concat(pendingData));
        pendingData = [];
      }
    }

    // Advance to next page
    let totalSegData = 0;
    for (let i = 0; i < numSegments; i++) totalSegData += segTable[i];
    pos = pos + 27 + numSegments + totalSegData;
  }

  return packets;
}
