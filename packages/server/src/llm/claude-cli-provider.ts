/**
 * Claude CLI provider — uses the local `claude` command as LLM backend.
 * No API key needed. Uses the user's Claude Code subscription/login.
 *
 * This enables zero-config LLM usage: if `claude` CLI is installed and
 * logged in (`claude auth status`), Airflux can use it directly.
 *
 * Usage: the model-factory checks this provider when no API key is found.
 */

import { execFileSync } from 'child_process';
import { logger } from '../lib/logger.js';

// null = not yet checked, false = checked and unavailable, true = available
let cliAvailable: boolean | null = null;
let lastCheckAt = 0;
const RECHECK_INTERVAL_MS = 30_000; // re-check every 30s so login changes are picked up

const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude`;

// ANTHROPIC_AUTH_TOKEN must NOT be passed to the Claude CLI subprocess.
// The CLI uses ~/.claude/.credentials.json for its own OAuth flow.
// If ANTHROPIC_AUTH_TOKEN is in the environment, the CLI tries to use it
// directly against api.anthropic.com, which rejects OAuth tokens.
const { ANTHROPIC_AUTH_TOKEN: _drop, ...processEnvWithoutOAuth } = process.env;
const ENV_WITH_PATH = {
  ...processEnvWithoutOAuth,
  PATH: `${process.env.HOME}/.local/bin:/usr/local/bin:${process.env.PATH}`,
};

/** Check if `claude` CLI is installed and authenticated. Re-checks every 30s. */
export function isClaudeCliAvailable(): boolean {
  const now = Date.now();
  if (cliAvailable === true) return true; // stay true until cleared
  if (cliAvailable === false && now - lastCheckAt < RECHECK_INTERVAL_MS) return false;

  lastCheckAt = now;
  try {
    const result = execFileSync(CLAUDE_BIN, ['auth', 'status'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: ENV_WITH_PATH,
    });
    cliAvailable = result.includes('"loggedIn": true') || result.includes('"loggedIn":true');
    if (cliAvailable) {
      logger.info('Claude CLI detected and authenticated');
    }
    return cliAvailable;
  } catch {
    cliAvailable = false;
    return false;
  }
}

/** Force re-check on next call (e.g. after login). */
export function resetCliAvailableCache(): void {
  cliAvailable = null;
  lastCheckAt = 0;
}

/**
 * Send a prompt to Claude via CLI and get a response.
 * Uses `claude --print` mode for simple text in / text out.
 *
 * @param prompt - The user prompt
 * @param systemPrompt - Optional system prompt
 * @param model - Model to use (default: claude-sonnet-4-6)
 * @returns The response text
 */
export function callClaudeCli(
  prompt: string,
  systemPrompt?: string,
  model: string = 'claude-sonnet-4-6',
): string {
  try {
    const args = ['--print', '--model', model];

    // Pass system prompt via flag (max 2000 chars to avoid arg length issues)
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt.slice(0, 2000));
    }

    // Pass user prompt via stdin (avoids shell arg length limits and quoting issues)
    const result = execFileSync(CLAUDE_BIN, args, {
      encoding: 'utf-8',
      input: prompt,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: ENV_WITH_PATH,
    });

    return result.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    // Strip the full command from the error to avoid leaking system prompt
    const clean = msg.replace(/Command failed:.*$/s, 'Command failed (see server logs)');
    throw new Error(`Claude CLI call failed: ${clean}`);
  }
}
