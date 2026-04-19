import { AsyncLocalStorage } from 'node:async_hooks';

export interface RuntimeRequestContext {
  userId: string;
  sessionId: string;
  source: string;
  agentName?: string;
}

const storage = new AsyncLocalStorage<RuntimeRequestContext>();

export function runWithRequestContext<T>(
  context: RuntimeRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

export function getRequestContext(): RuntimeRequestContext | undefined {
  return storage.getStore();
}

/**
 * Asserts a userId is present in the current request context.
 * Use at the top of any operation that must be attributed to a real user
 * (per-user storage reads, cost tracking, audit logging).
 */
export function requireUserId(): string {
  const ctx = storage.getStore();
  if (!ctx || !ctx.userId) {
    throw new Error('requireUserId: no userId in current request context');
  }
  return ctx.userId;
}
