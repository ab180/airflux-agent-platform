import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';

export const STATE_VERSION = 1;

export interface ServiceState {
  pid?: number;
  container?: string;
  port: number;
}

export interface AiropsState {
  version: number;
  startedAt: string;
  services: {
    pg: ServiceState;
    server: ServiceState;
    web: ServiceState;
  };
}

export function stateFilePath(cwd: string = process.cwd()): string {
  return resolve(cwd, '.airops', 'state.json');
}

export function readState(cwd?: string): AiropsState | null {
  const path = stateFilePath(cwd);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as AiropsState;
    if (parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeState(state: AiropsState, cwd?: string): void {
  const path = stateFilePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function clearState(cwd?: string): void {
  const path = stateFilePath(cwd);
  if (existsSync(path)) unlinkSync(path);
}
