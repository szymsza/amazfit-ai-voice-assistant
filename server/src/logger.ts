import path from 'path';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';

const LOGS_DIR = path.join(process.cwd(), 'logs');
const INPUTS_DIR = path.join(LOGS_DIR, 'inputs');
const OUTPUTS_DIR = path.join(LOGS_DIR, 'outputs');
[LOGS_DIR, INPUTS_DIR, OUTPUTS_DIR].forEach(dir => mkdirSync(dir, { recursive: true }));

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeStr(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

export function makeRequestId(d: Date): string {
  return timeStr(d).replace(/:/g, '-');
}

export function trace(d: Date, id: string, message: string, type: 'log' | 'warn' | 'error' = 'log'): void {
  const line = `[${dateStr(d)} ${timeStr(d)}] [${id}] ${message}\n`;
  appendFileSync(path.join(LOGS_DIR, `${dateStr(d)}.log`), line);
  console[type](`[${d.toISOString()}] [${id}] ${message}`);
}

export function saveInput(d: Date, id: string, data: Buffer): void {
  writeFileSync(path.join(INPUTS_DIR, `${dateStr(d)}_${id}.opus`), data);
}

export function saveOutput(d: Date, id: string, data: Buffer): void {
  writeFileSync(path.join(OUTPUTS_DIR, `${dateStr(d)}_${id}.mp3`), data);
}
