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

let cliAvailable: boolean | null = null;

const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude`;
const ENV_WITH_PATH = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` };

/** Check if `claude` CLI is installed and authenticated. */
export function isClaudeCliAvailable(): boolean {
  if (cliAvailable !== null) return cliAvailable;

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
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt.slice(0, 4000));
    }
    args.push(prompt);

    const result = execFileSync(CLAUDE_BIN, args, {
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: ENV_WITH_PATH,
    });

    return result.trim();
  } catch (e) {
    throw new Error(`Claude CLI call failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}
