console.log('[side] module loaded');
import { BaseSideService } from '@zeppos/zml/base-side';
import { base64ToArrayBuffer } from '../utils/index';
const SERVER_URL_KEY = 'serverUrl';
const API_TOKEN_KEY = 'apiToken';
const GROQ_KEY_KEY = 'groqKey';
const LLM_PROVIDER_KEY = 'llmProvider';
const LLM_MODEL_KEY = 'llmModel';
const LLM_KEY_KEY = 'llmKey';
const TTS_VOICE_KEY = 'ttsVoice';
const MAX_TURNS_KEY = 'maxTurns';
const DEFAULT_SERVER_URL = 'http://localhost:3000';
const DEFAULT_API_TOKEN = 'your_secret_token_here';
const DEFAULT_MAX_TURNS = 10;
// Module-level conversation memory — resets when onDestroy is called (app closed)
let conversation = [];
// Register shake handler before ZML sets up its peerSocket listener.
// ZML's onMessage() can't handle raw BIN shake packets, so we respond ourselves.
// Header layout (from ZML buildBin): flag(1), version(1), type uint16LE(2),
// port1 uint16LE(2), port2 uint16LE(2), appId uint32LE(4), extra uint32LE(4), payload...
function buildShakeResponse(shakeBuf) {
    const devicePort = shakeBuf[4] | (shakeBuf[5] << 8);
    const appId = shakeBuf[8] | (shakeBuf[9] << 8) | (shakeBuf[10] << 16) | (shakeBuf[11] << 24);
    const resp = Buffer.alloc(17); // 16-byte header + 1 byte payload
    resp[0] = 1;
    resp[1] = 1; // flag=1, version=1
    resp[2] = 1;
    resp[3] = 0; // type=1 (Shake) as uint16 LE
    resp[4] = 1;
    resp[5] = 0; // port1=1 (side service port)
    resp[6] = devicePort & 0xFF;
    resp[7] = (devicePort >> 8) & 0xFF; // port2=device port
    resp[8] = appId & 0xFF;
    resp[9] = (appId >> 8) & 0xFF;
    resp[10] = (appId >> 16) & 0xFF;
    resp[11] = (appId >> 24) & 0xFF;
    resp[12] = resp[13] = resp[14] = resp[15] = 0; // extra=0
    resp[16] = appId & 0xFF; // payload: low byte of appId
    return resp;
}
function shakeMessageHandler(msg) {
    const buf = Buffer.from(msg);
    // Detect shake: flag=1 (byte 0), type=1 as uint16LE (bytes 2-3=0x01,0x00), min 16 bytes
    if (buf.byteLength >= 16 && buf[0] === 1 && buf[2] === 1 && buf[3] === 0) {
        console.log('[side] shake detected, sending response');
        const resp = buildShakeResponse(buf);
        messaging.peerSocket.send(resp.buffer);
    }
}
let shakeHandlerRegistered = false;
function registerShakeHandler() {
    if (!(messaging === null || messaging === void 0 ? void 0 : messaging.peerSocket))
        return;
    // Remove before adding to avoid duplicates across hot reloads
    messaging.peerSocket.removeListener('message', shakeMessageHandler);
    messaging.peerSocket.addListener('message', shakeMessageHandler);
    shakeHandlerRegistered = true;
    console.log('[side] shake handler registered');
}
// Register at module load for the initial connection
registerShakeHandler();
try {
    AppSideService(BaseSideService({
        onInit() {
            console.log('[side] onInit called');
            registerShakeHandler();
        },
        onRun() {
            // Re-register on each run to handle hot reload / device reconnect
            registerShakeHandler();
        },
        onDestroy() {
            console.log('[side] onDestroy called');
            // Reset conversation memory when the app is closed
            conversation = [];
        },
        onRequest(req, res) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            const b64 = req;
            console.log('[side] onRequest called, base64 length:', (_a = b64 === null || b64 === void 0 ? void 0 : b64.length) !== null && _a !== void 0 ? _a : 'unknown');
            // Decode base64 → binary (ZML can't send raw ArrayBuffer from watch side)
            const audioBuffer = base64ToArrayBuffer(b64);
            console.log('[side] decoded audio size:', audioBuffer.byteLength);
            // Audio received by phone — notify watch to transition to Waiting
            const call = this.call.bind(this);
            call({ method: 'stateUpdate', params: { state: 'waiting' } });
            const serverUrl = (_b = settings.settingsStorage.getItem(SERVER_URL_KEY)) !== null && _b !== void 0 ? _b : DEFAULT_SERVER_URL;
            const apiToken = (_c = settings.settingsStorage.getItem(API_TOKEN_KEY)) !== null && _c !== void 0 ? _c : DEFAULT_API_TOKEN;
            const groqKey = (_d = settings.settingsStorage.getItem(GROQ_KEY_KEY)) !== null && _d !== void 0 ? _d : '';
            const llmProvider = (_e = settings.settingsStorage.getItem(LLM_PROVIDER_KEY)) !== null && _e !== void 0 ? _e : 'groq';
            const llmModel = (_f = settings.settingsStorage.getItem(LLM_MODEL_KEY)) !== null && _f !== void 0 ? _f : '';
            const llmKey = (_g = settings.settingsStorage.getItem(LLM_KEY_KEY)) !== null && _g !== void 0 ? _g : groqKey;
            const ttsVoice = (_h = settings.settingsStorage.getItem(TTS_VOICE_KEY)) !== null && _h !== void 0 ? _h : 'austin';
            const maxTurns = parseInt((_j = settings.settingsStorage.getItem(MAX_TURNS_KEY)) !== null && _j !== void 0 ? _j : String(DEFAULT_MAX_TURNS), 10);
            // Cap conversation history before sending
            const cappedConversation = conversation.slice(-maxTurns);
            const config = {
                groqKey,
                llmProvider,
                llmModel,
                llmKey,
                ttsVoice,
                maxTurns,
                conversation: cappedConversation,
            };
            const form = new FormData();
            form.append('audio', new Blob([audioBuffer], { type: 'audio/ogg' }), 'recording.opus');
            form.append('config', JSON.stringify(config));
            fetch(`${serverUrl}/api/ask`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiToken}` },
                body: form,
            })
                .then((response) => {
                console.log('[side] fetch response status:', response.status);
                if (!response.ok) {
                    return Promise.reject(new Error(`Server error: ${response.status}`));
                }
                return response.json();
            })
                .then((json) => {
                const data = json;
                // Update conversation memory with the full updated history from server
                conversation = data.conversation;
                console.log('[side] conversation updated, turns:', conversation.length, 'audio b64 length:', data.audio.length);
                // audio is already base64-encoded OPUS — pass directly to watch
                res(null, data.audio);
            })
                .catch((err) => {
                console.error('[side] request failed:', String(err));
                res(err);
            });
        },
    }));
}
catch (e) {
    console.error('[side] AppSideService setup threw:', String(e));
}
