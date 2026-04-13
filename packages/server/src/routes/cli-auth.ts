/**
 * CLI auth routes — trigger `claude login` or `codex login` from the dashboard.
 * Spawns the CLI process server-side, which opens a browser for OAuth.
 * Dashboard polls for completion.
 */

import { Hono } from 'hono';
import { spawn } from 'child_process';
import { logger } from '../lib/logger.js';
import { isClaudeCliAvailable } from '../llm/claude-cli-provider.js';

export const cliAuthRoutes = new Hono();

const ENV_WITH_PATH = { ...process.env, PATH: `${process.env.HOME}/.local/bin:/usr/local/bin:${process.env.PATH}` };

interface LoginJob {
  provider: string;
  status: 'running' | 'success' | 'failed';
  output: string;
  startedAt: number;
}

const activeJobs = new Map<string, LoginJob>();

cliAuthRoutes.post('/cli-auth/login', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const b = body as Record<string, unknown>;
  const provider = b.provider as string;

  if (provider !== 'claude' && provider !== 'codex') {
    return c.json({ success: false, error: 'provider must be "claude" or "codex"' }, 400);
  }

  // Check if already running
  const existing = activeJobs.get(provider);
  if (existing && existing.status === 'running' && Date.now() - existing.startedAt < 120_000) {
    return c.json({ success: true, status: 'running', message: `${provider} login already in progress` });
  }

  const job: LoginJob = { provider, status: 'running', output: '', startedAt: Date.now() };
  activeJobs.set(provider, job);

  const cmd = provider === 'claude'
    ? `${process.env.HOME}/.local/bin/claude`
    : 'codex';

  try {
    const child = spawn(cmd, ['login'], {
      env: ENV_WITH_PATH,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    child.stdout?.on('data', (data: Buffer) => {
      job.output += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      job.output += data.toString();
    });

    child.on('close', (code) => {
      job.status = code === 0 ? 'success' : 'failed';
      logger.info(`CLI login completed`, { provider, code, output: job.output.slice(0, 200) });
    });

    child.on('error', (err) => {
      job.status = 'failed';
      job.output = err.message;
    });

    // Auto-cleanup after 2 minutes
    setTimeout(() => {
      if (job.status === 'running') {
        job.status = 'failed';
        job.output += '\nTimeout: login took too long';
        try { child.kill(); } catch { /* ignore */ }
      }
    }, 120_000);

    return c.json({
      success: true,
      status: 'running',
      message: `${provider} login 시작됨 — 브라우저에서 인증을 완료하세요`,
    });
  } catch (e) {
    job.status = 'failed';
    job.output = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ success: false, error: `Failed to start ${provider} login: ${job.output}` }, 500);
  }
});

cliAuthRoutes.get('/cli-auth/status', (c) => {
  const provider = c.req.query('provider') || 'claude';
  const job = activeJobs.get(provider);

  if (!job) {
    // No active job — check if already logged in
    const isLoggedIn = provider === 'claude' ? isClaudeCliAvailable() : !!process.env.OPENAI_API_KEY;
    return c.json({
      provider,
      loggedIn: isLoggedIn,
      loginStatus: null,
    });
  }

  return c.json({
    provider,
    loggedIn: provider === 'claude' ? isClaudeCliAvailable() : !!process.env.OPENAI_API_KEY,
    loginStatus: job.status,
    output: job.output.slice(0, 500),
  });
});
