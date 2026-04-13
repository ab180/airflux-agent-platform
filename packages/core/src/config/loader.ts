import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ConfigLoadError } from '../types/errors.js';

let settingsDir = resolve(process.cwd(), 'settings');

const cache = new Map<string, { data: unknown; mtime: number }>();

export function setSettingsDir(dir: string): void {
  settingsDir = resolve(dir);
  cache.clear();
}

export function getSettingsDir(): string {
  return settingsDir;
}

export function loadConfig<T>(name: string): T {
  const filePath = join(settingsDir, `${name}.yaml`);
  if (!existsSync(filePath)) {
    throw new ConfigLoadError(name, new Error(`File not found: ${filePath}`));
  }

  // Check cache: return if file hasn't changed
  const stat = statSync(filePath);
  const mtime = stat.mtimeMs;
  const cached = cache.get(filePath);
  if (cached && cached.mtime === mtime) {
    return cached.data as T;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = parseYaml(content) as T;
    cache.set(filePath, { data, mtime });
    return data;
  } catch (e) {
    throw new ConfigLoadError(name, e instanceof Error ? e : new Error(String(e)));
  }
}

export function loadConfigOptional<T>(name: string, defaultValue: T): T {
  try {
    return loadConfig<T>(name);
  } catch {
    return defaultValue;
  }
}

export function saveConfig(name: string, data: unknown): void {
  const filePath = join(settingsDir, `${name}.yaml`);
  const content = stringifyYaml(data, { lineWidth: 120 });
  writeFileSync(filePath, content, 'utf-8');
  // Invalidate cache for this file
  cache.delete(filePath);
}

export function clearConfigCache(): void {
  cache.clear();
}
