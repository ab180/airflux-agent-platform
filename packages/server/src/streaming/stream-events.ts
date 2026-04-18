/**
 * Wire protocol for /api/query/stream (SSE).
 *
 * Server translates AI SDK `fullStream` events (TextStreamPart) into a
 * small wire vocabulary that the dashboard can render incrementally.
 * Keeps the client contract narrow so future refactors on the AI SDK
 * side don't leak through.
 *
 * Event types sent to the client:
 *   text          — a text delta (append to the current assistant message)
 *   tool-call     — the LLM called a tool (show "🔧 name(args)" marker)
 *   tool-result   — tool finished; a short summary of the output
 *   tool-error    — tool threw; render as inline error marker
 *   done          — final event with finishReason + usage
 *   error         — stream-level error (LLM failure, network, etc)
 */

export type WireEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; id: string; tool: string; args: unknown }
  | { type: 'tool-result'; id: string; tool: string; summary: string }
  | { type: 'tool-error'; id: string; tool: string; message: string }
  | {
      type: 'done';
      finishReason: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { type: 'error'; message: string };

type FullStreamPart = Record<string, unknown> & { type: string };

function summarizeOutput(output: unknown, maxLen = 300): string {
  let s: string;
  try {
    s = typeof output === 'string' ? output : JSON.stringify(output);
  } catch {
    s = String(output);
  }
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return s;
}

export function toWireEvent(part: FullStreamPart): WireEvent | null {
  switch (part.type) {
    case 'text-delta':
      return { type: 'text', delta: String(part.text ?? '') };
    case 'tool-call':
      return {
        type: 'tool-call',
        id: String(part.toolCallId ?? ''),
        tool: String(part.toolName ?? ''),
        args: part.input,
      };
    case 'tool-result':
      return {
        type: 'tool-result',
        id: String(part.toolCallId ?? ''),
        tool: String(part.toolName ?? ''),
        summary: summarizeOutput(part.output),
      };
    case 'tool-error': {
      const err = part.error;
      const message = err instanceof Error ? err.message : String(err ?? 'unknown error');
      return {
        type: 'tool-error',
        id: String(part.toolCallId ?? ''),
        tool: String(part.toolName ?? ''),
        message,
      };
    }
    case 'finish': {
      const usage = (part.totalUsage as { inputTokens?: number; outputTokens?: number } | undefined) ?? {};
      return {
        type: 'done',
        finishReason: String(part.finishReason ?? 'unknown'),
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
        },
      };
    }
    case 'error': {
      const err = part.error;
      const message = err instanceof Error ? err.message : String(err ?? 'unknown error');
      return { type: 'error', message };
    }
    default:
      return null;
  }
}

export function formatSSELine(event: WireEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
