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
