# PRD: Amazfit Voice Assistant

## Introduction

A voice AI assistant for the Amazfit Balance smartwatch running Zepp OS. Users press a button, ask a question by voice, and receive a spoken answer. The system uses a monorepo with a Zepp OS mini-app (watch + phone Side Service) and a stateless Node.js backend server that chains STT, LLM, and TTS APIs.

The server receives audio and conversation history, transcribes the audio, generates an LLM response, converts it to speech, and returns audio + text. Conversation context is maintained client-side on the watch, capped to the last few turns.

## Goals

- Provide a hands-free voice assistant experience on Amazfit Balance
- Achieve end-to-end response time under 3 seconds for the server pipeline (STT + LLM + TTS)
- Support multiple LLM providers: Groq (default), Claude, ChatGPT
- Use Groq for both STT (Whisper) and TTS (Orpheus) to minimize cost
- Keep the server stateless and deployable anywhere (VPS, cloud, etc.)
- Allow users to configure API keys, LLM provider, model, and voice from the watch settings

## User Stories

### US-001: Set up Zepp OS project from template
**Description:** As a developer, I need a Zepp OS project scaffolded so we can build the watch app.

**Acceptance Criteria:**
- [ ] Zepp OS project created in app/ directory from official template
- [ ] Project targets Amazfit Balance (round watch, 480x480)
- [ ] package.json and app.json configured correctly

> **HUMAN CHECKPOINT:** After this story, yield control to the user. They must install Zepp CLI, register a dev account, and verify the app runs in the simulator before continuing.

### US-002: Watch UI - recording button and state indicator
**Description:** As a user, I want a button on the watch face to start/stop voice recording with visual feedback.

**Acceptance Criteria:**
- [ ] Main page has a prominent record button
- [ ] Visual indicator shows current state: idle, recording, sending, waiting, playing
- [ ] Button press toggles recording on/off
- [ ] Uses Zepp OS Recorder API to capture audio in OPUS format

### US-003: Watch audio playback
**Description:** As a user, I want recorded audio to play back on the watch so I can verify capture works.

**Acceptance Criteria:**
- [ ] Recorded OPUS audio plays back through watch speaker via Player API
- [ ] Playback starts automatically after recording stops (for testing)

> **HUMAN CHECKPOINT:** User must verify recording and playback works on simulator/device before continuing.

### US-004: Build echo server with auth
**Description:** As a developer, I need a Node.js server that echoes back received audio, so I can test the pipeline before adding AI.

**Acceptance Criteria:**
- [ ] Node.js/Express server in server/ directory
- [ ] POST /api/ask endpoint accepts audio bytes in request body
- [ ] Validates shared secret API token from Authorization header
- [ ] Returns 401 for missing/invalid token
- [ ] Returns the same audio bytes in response on valid request
- [ ] Server reads config from environment variables (PORT, API_TOKEN)
- [ ] package.json with start script

### US-005: Side Service - send audio to server
**Description:** As a developer, I need the Side Service to forward recorded audio from the watch to the server and return the response.

**Acceptance Criteria:**
- [ ] Side Service receives audio data from watch via BLE messaging
- [ ] Side Service sends audio to server via fetch() POST with Authorization header
- [ ] Side Service receives server response and forwards audio back to watch
- [ ] Watch plays received audio via Player API

### US-006: Watch to Side Service BLE communication
**Description:** As a developer, I need the watch app to send recorded audio to the Side Service and receive audio responses back over BLE.

**Acceptance Criteria:**
- [ ] Watch sends recorded OPUS audio bytes to Side Service via Messaging or TransferFile API
- [ ] Watch receives audio response from Side Service
- [ ] Watch plays received audio via Player API

> **HUMAN CHECKPOINT:** User must test full echo round-trip on simulator and then on real Amazfit Balance device. Report any BLE transfer issues or limitations.

### US-007: Server - STT via Groq Whisper
**Description:** As a user, I want my voice transcribed to text so the AI can understand my question.

**Acceptance Criteria:**
- [ ] Server sends received audio to Groq Whisper API (POST /audio/transcriptions, model: whisper-large-v3)
- [ ] Uses Groq API key from request header (X-Groq-Key)
- [ ] Transcribed text extracted from response JSON
- [ ] Returns error message to client if Whisper API fails

### US-008: Server - LLM provider abstraction layer
**Description:** As a developer, I need a clean abstraction for LLM providers so adding new ones is easy.

**Acceptance Criteria:**
- [ ] LLM module accepts: provider name, model name, API key, messages array, max turns
- [ ] Module validates and caps conversation history to max turns (default: 10)
- [ ] Returns response text from the LLM
- [ ] Provider interface is simple enough to add new providers with minimal code

### US-009: Server - Groq LLM provider
**Description:** As a user, I want to get answers from Groq (default LLM provider).

**Acceptance Criteria:**
- [ ] Groq provider sends messages to POST /chat/completions
- [ ] Default model: moonshotai/kimi-k2-instruct
- [ ] Uses Groq API key from request
- [ ] Conversation history included in messages array
- [ ] Response text extracted from API response

### US-010: Server - Claude LLM provider
**Description:** As a user, I want to choose Claude as my LLM for higher quality answers.

**Acceptance Criteria:**
- [ ] Claude provider sends messages to Anthropic API
- [ ] Supports model selection: haiku 4.5, sonnet 4.6
- [ ] Uses Anthropic API key from request (X-LLM-Key header)
- [ ] Same conversation history handling as Groq provider

### US-011: Server - ChatGPT LLM provider
**Description:** As a user, I want to choose ChatGPT as my LLM.

**Acceptance Criteria:**
- [ ] OpenAI provider sends messages to OpenAI chat completions API
- [ ] Supports model selection: gpt-4o-mini, gpt-4o
- [ ] Uses OpenAI API key from request (X-LLM-Key header)
- [ ] Same conversation history handling as Groq provider

### US-012: Server - TTS via Groq Orpheus with ffmpeg conversion
**Description:** As a user, I want the AI response converted to speech audio I can hear on my watch.

**Acceptance Criteria:**
- [ ] Server sends LLM response text to Groq TTS API (POST /audio/speech, model: canopylabs/orpheus-v1-english)
- [ ] Voice selection from request (default: austin)
- [ ] WAV response converted to OPUS via ffmpeg child process
- [ ] OPUS audio bytes returned in server response
- [ ] Uses Groq API key from request

### US-013: Server - wire up full pipeline endpoint
**Description:** As a developer, I need the /api/ask endpoint to chain STT -> LLM -> TTS and return audio + text.

**Acceptance Criteria:**
- [ ] POST /api/ask accepts: audio bytes, conversation history, provider config (provider, model, voice, max turns), API keys
- [ ] Pipeline: receive audio -> Whisper STT -> LLM (selected provider) -> Orpheus TTS -> ffmpeg -> respond
- [ ] Response includes: OPUS audio, transcribed question text, LLM response text, updated conversation array
- [ ] Errors at any stage return a meaningful error message to the client

### US-014: Client-side conversation memory in Side Service
**Description:** As a user, I want follow-up questions to have context from previous exchanges.

**Acceptance Criteria:**
- [ ] Side Service maintains an array of {role, content} message objects
- [ ] Conversation array sent alongside audio in each POST to server
- [ ] Side Service updates its array with the conversation returned by server
- [ ] Array capped to configurable max turns (default: 10) before sending
- [ ] Conversation resets when the app is closed

### US-015: Watch UI - display question and response text
**Description:** As a user, I want to see my transcribed question and the AI's answer on the watch screen.

**Acceptance Criteria:**
- [ ] Transcribed user question displayed on screen after server responds
- [ ] AI response text displayed below the question
- [ ] Text is scrollable if it exceeds screen size
- [ ] Loading/status indicators during: recording, sending, waiting, playing

> **HUMAN CHECKPOINT:** User must verify UI displays correctly on the watch (text rendering, scrolling, indicators).

### US-016: Watch settings page
**Description:** As a user, I want to configure the assistant settings from my watch or companion app.

**Acceptance Criteria:**
- [ ] Settings page accessible from the app
- [ ] Configurable: server URL, server API token, Groq API key
- [ ] Configurable: LLM provider (Groq/Claude/ChatGPT), LLM API key, model selection
- [ ] Configurable: TTS voice (austin, troy, hannah, etc.), max conversation turns (default: 10)
- [ ] Model options update based on selected LLM provider
- [ ] Settings persist across app restarts
- [ ] App validates required keys are set before allowing voice queries

> **HUMAN CHECKPOINT:** User must verify settings page works and values persist correctly.

### US-017: Benchmark ChatGPT and Claude vs Groq
**Description:** As a developer, I need to benchmark all LLM providers to document speed, accuracy, and cost tradeoffs.

**Acceptance Criteria:**
- [ ] Test gpt-4o-mini, gpt-4o, haiku 4.5, sonnet 4.6 with identical prompts
- [ ] Measure response latency, answer accuracy (current events, general knowledge), cost per request
- [ ] Compare against Groq kimi-k2-instruct baseline (~0.42s)
- [ ] Results documented in project

> **HUMAN CHECKPOINT:** Requires API keys for OpenAI and Anthropic. Yield control to the user to provide keys and review results.

## Functional Requirements

- FR-1: The watch app records audio in OPUS format via the Recorder API
- FR-2: Audio is sent from watch to Side Service over BLE, then to the server via fetch() POST
- FR-3: The server authenticates requests using a shared secret API token in the request header
- FR-4: The server accepts user-provided API keys (Groq, and optionally Claude/OpenAI) in each request
- FR-5: The server transcribes audio using Groq Whisper API (whisper-large-v3)
- FR-6: The server generates an LLM response using the user-selected provider and model
- FR-7: The server includes client-provided conversation history in the LLM request, capped to a configurable max turns (default: 10)
- FR-8: The server converts LLM response text to speech using Groq Orpheus TTS
- FR-9: The server converts TTS output from WAV to OPUS using ffmpeg
- FR-10: The server returns OPUS audio, transcribed question text, and response text to the client
- FR-11: The watch plays response audio via Player API and displays text on screen
- FR-12: The Side Service maintains conversation history client-side, capped to configurable max turns
- FR-13: The settings page allows configuration of server URL, API keys, LLM provider/model, TTS voice, and max conversation turns

## Non-Goals

- No user accounts or multi-user support on the server (single shared-secret auth only)
- No persistent conversation history across app restarts
- No on-device (local) STT/LLM/TTS processing
- No streaming audio playback (full response is received before playback starts)
- No separate Android companion app (Side Service runs inside Zepp companion app)
- No support for watches other than Amazfit Balance (initially)

## Technical Considerations

- **Zepp OS constraints**: Side Service runs inside the Zepp companion app on the phone. Communication between watch and phone is via BLE (limited bandwidth). The Fetch API is only available in the Side Service, not on the watch directly.
- **Audio format**: Watch records in OPUS, server returns OPUS. Server receives OPUS for STT and converts WAV->OPUS for TTS output. ffmpeg must be available on the server.
- **Stateless server**: All state (conversation history, settings) lives on the client. The server processes each request independently using the provided context.
- **API key security**: User API keys are sent per-request and never stored on the server. The shared secret token protects the server endpoint from unauthorized access.
- **Conversation cap**: Both client and server enforce a configurable max turn limit (default: 10) to prevent unbounded LLM context (and cost).
- **LLM provider abstraction**: The server should have a clean abstraction layer so adding new LLM providers is straightforward. All three providers (Groq, OpenAI, Anthropic) use similar chat completion APIs.

## Success Metrics

- Server pipeline (STT + LLM + TTS + conversion) completes in under 3 seconds with Groq
- Audio round-trip (watch -> server -> watch) completes in under 5 seconds total
- Voice transcription accuracy is sufficient for conversational queries
- App is stable on Amazfit Balance for extended use sessions

## Open Questions

- What is the BLE transfer speed for audio files on Amazfit Balance? May affect max audio length.
- Does the Zepp OS Player API support OPUS playback reliably, or should we fall back to MP3?
- What is the optimal system prompt for the voice assistant use case?
