# AmazfitVoiceAssistant

A voice AI assistant mini-app for the Amazfit Balance smartwatch (Zepp OS). Record a voice question on the watch → audio sent via BLE to phone Side Service → forwarded to a Node.js backend → STT → LLM → TTS pipeline → response audio played back on the watch.

## Project structure

```
app/          Zepp OS mini-app (watch + phone side service)
  src/        TypeScript sources
    app.ts              App entry point
    app-side/index.ts   Phone Side Service (BLE → server → BLE)
    page/gt/home/       Watch UI (record button, state machine)
    setting/index.ts    Settings page
    utils/              Shared utilities + test audio buffer
    global.d.ts         Zepp OS type declarations
  app.json    Zepp OS config (app ID, permissions, device targets)
  assets/     Static assets (icons, fonts)
  shared/     Plain-JS polyfills (not TypeScript)

server/       Node.js/Express backend
  src/index.ts  POST /api/ask endpoint (STT → LLM → TTS pipeline)
  .env.example  Config template
```

## Commands

### Watch app (`cd app`)

| Command | Description |
|---|---|
| `npm run watch` | Compile TS on changes (development) |
| `npm run dev` | Compile + launch in Zeus simulator |
| `npm run preview` | Compile + display a QR code to preview on a real device |
| `npm run build` | Compile + Zeus build for device |
| `npm run compile` | TypeScript → JS only (no Zeus) |
| `npm run typecheck` | Type-check without emitting |

### Server (`cd server`)

| Command | Description |
|---|---|
| `npm run dev` | Run with ts-node, no build step (development) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run typecheck` | Type-check without emitting |
| `npm run deploy` | Build and start or restart the PM2 instance |
| `npm run logs:clear` | Delete all log files and audio recordings in `logs/` |
| `npm run pm2:install` | Install PM2 globally (one-time setup) |
| `npm run pm2:setup` | Configure PM2 to auto-start on reboot (one-time setup) |
| `npm run pm2:start` | Start server under PM2 |
| `npm run pm2:restart` | Restart the running PM2 instance |
| `npm run pm2:stop` | Stop the PM2 instance |
| `npm run pm2:logs` | Stream PM2 logs |

## Server config

Copy `server/.env.example` to `server/.env` and set:
- `API_TOKEN` — shared secret for Bearer token auth
- `PORT` — port to listen on (default 3000)

For simulator testing, update `DEFAULT_SERVER_URL` in `app/src/app-side/index.ts` to your machine's LAN IP.

## Deploying to VPS with PM2

### One-time setup:
```bash
cd server
npm run pm2:install   # install PM2 globally
npm run pm2:setup     # configure auto-start on reboot
```

### Deploy / redeploy:
```bash
cd server && npm run deploy
```

### VPS environment & proxy:
Copy `server/.env.example` to `server/.env` and set `API_TOKEN` and `PORT` (use a unique port like 3001 to avoid conflicts). Then create an Apache VirtualHost to proxy requests:
```apache
<VirtualHost *:80>
    ServerName api.yourdomain.com
    ProxyPreserveHost On
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/
</VirtualHost>
```
Enable modules: `sudo a2enmod proxy proxy_http && sudo systemctl restart apache2`
