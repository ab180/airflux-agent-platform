/**
 * Codex CLI provider — uses the local `codex` command as LLM backend.
 * No API key needed. Uses the user's OpenAI/Codex subscription/login.
 *
 * Codex CLI v0.121.0+: `codex exec -m MODEL "prompt"` or stdin.
 * Default model: gpt-5.4.
 *
 * ---
 * FROZEN 2026-04-18 — production path paused
 *
 * Local experimentation remains allowed. Production model-factory must not
 * route through this provider until a business need for an OpenAI-specific
 * model is established. See docs/FROZEN.md.
 */

import { execFileSync } from 'child_process';
import { logger } from '../lib/logger.js';

let cliAvailable: boolean | null = null;
let lastCheckAt = 0;
const RECHECK_INTERVAL_MS = 30_000;

// Try common locations for codex binary
const CODEX_PATHS = [
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
  `${process.env.HOME}/.local/bin/codex`,
];

function findCodexBin(): string | null {
  for (const p of CODEX_PATHS) {
    try {
      execFileSync(p, ['--version'], { encoding: 'utf-8', timeout: 3000 });
      return p;
    } catch { /* try next */ }
  }
  return null;
}

let codexBin: string | null = null;

const ENV_WITH_PATH = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`,
};

/** Check if `codex` CLI is installed and authenticated. Re-checks every 30s. */
export function isCodexCliAvailable(): boolean {
  const now = Date.now();
  if (cliAvailable === true) return true;
  if (cliAvailable === false && now - lastCheckAt < RECHECK_INTERVAL_MS) return false;

  lastCheckAt = now;
  try {
    codexBin = findCodexBin();
    if (!codexBin) {
      cliAvailable = false;
      return false;
    }
    // Quick test: codex exec should return without auth error
    cliAvailable = true;
    logger.info('Codex CLI detected', { path: codexBin });
    return true;
  } catch {
    cliAvailable = false;
    return false;
  }
}

/**
 * Send a prompt to Codex via CLI and get a response.
 * Uses `codex exec` mode for non-interactive execution.
 *
 * @param prompt - The user prompt (sent via stdin)
 * @param systemPrompt - Optional prefix added to the prompt
 * @param model - Model to use (default: gpt-5.4)
 * @returns The response text
 */
export function callCodexCli(
  prompt: string,
  systemPrompt?: string,
  model: string = 'gpt-5.4',
): string {
  if (!codexBin) {
    codexBin = findCodexBin();
    if (!codexBin) throw new Error('Codex CLI not found');
  }

  try {
    const args = ['exec', '-m', model, '--skip-git-repo-check'];

    // Codex exec doesn't have --system-prompt, so prepend to the prompt
    const fullPrompt = systemPrompt
      ? `${systemPrompt.slice(0, 2000)}\n\n---\n\n${prompt}`
      : prompt;

    const result = execFileSync(codexBin, args, {
      encoding: 'utf-8',
      input: fullPrompt,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: ENV_WITH_PATH,
    });

    // Codex exec includes header lines (model, workdir, etc.) — extract only the response
    const lines = result.split('\n');
    const codexIdx = lines.findIndex(l => l.trim() === 'codex');
    if (codexIdx >= 0) {
      return lines.slice(codexIdx + 1).join('\n').trim();
    }
    return result.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const clean = msg.replace(/Command failed:.*$/s, 'Command failed (see server logs)');
    throw new Error(`Codex CLI call failed: ${clean}`);
  }
}
