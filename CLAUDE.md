# AmazfitVoiceAssistant

Voice AI assistant for Amazfit Balance smartwatch (Zepp OS). User records a voice question on the watch → audio is sent via BLE to a phone Side Service → forwarded to a Node.js server → STT → LLM → TTS pipeline → response audio played back on the watch.

## Architecture

Monorepo with two components:

- **`app/`** — Zepp OS mini-app (TypeScript, compiled to JS for watch + phone)
  - `app/src/page/gt/home/index.page.ts` — Watch UI: record button, state machine (Idle→Recording→Sending→Waiting→Playing)
  - `app/src/app-side/index.ts` — Phone Side Service: BLE handshake, receives audio from watch, calls server, returns response
  - `app/src/app.ts` — App entry point
  - `app/app.json` — Zepp OS config (app ID, permissions, API version, device targets)
  - `app/src/global.d.ts` — Type declarations for Zepp OS globals
  - `app/src/utils/testAudio.ts` — Pre-recorded OPUS buffer for simulator testing
  - TypeScript sources live in `app/src/`; compiled JS outputs to `app/` (alongside source in subdirs)
- **`server/`** — Node.js/Express backend
  - `server/src/index.ts` — Single `POST /api/ask` endpoint (currently an echo stub; intended pipeline: Groq Whisper STT → LLM → Groq Orpheus TTS)
  - `server/.env` / `.env.example` — `API_TOKEN` and `PORT` config

## Communication Flow

```
Watch (Recorder API → OPUS)
  → Phone Side Service (BLE)
    → Server POST /api/ask (Bearer token auth, raw binary body)
      → [STT → LLM → TTS]  ← not yet implemented; currently echoes audio
    ← binary OPUS response
  ← BLE message back
Watch (Player API)
```

Server URL and API token are configured in app settings storage (`DEFAULT_SERVER_URL`, `DEFAULT_API_TOKEN` in `app/app-side/index.ts`).

## Building

**App** (Zepp OS watch app):
```bash
cd app
npm run compile    # TypeScript → JS (outputs alongside source files)
npm run build      # compile + zeus build (for device)
npm run dev        # compile + zeus dev (simulator)
npm run typecheck  # type-check only
```

**Server**:
```bash
cd server
npm run build      # TypeScript → dist/index.js
npm run dev        # run with ts-node (no build step)
npm start          # run compiled dist/
npm run typecheck  # type-check only
```

## Key Notes

- The app uses `@zeppos/zml` as the Zepp OS abstraction layer. Device APIs (Recorder, Player, BLE messaging) are Zepp OS-specific — not standard JS.
- The server `POST /api/ask` expects raw binary audio (`express.raw`), Bearer token auth, and currently just echoes audio back. Full STT/LLM/TTS pipeline is the next implementation target.
- For simulator testing, set `DEFAULT_SERVER_URL` in `app/app-side/index.ts` to your machine's LAN IP.
- See `info.txt` for detailed architecture notes and `TESTING.txt` for setup steps.
