import { describe, it, expect } from 'vitest';
import type { StorageAdapter, SchedulerAdapter, TraceSink } from '../index.js';

describe('@airflux/runtime scaffold', () => {
  it('exports StorageAdapter/SchedulerAdapter/TraceSink as types', () => {
    // Compile-time check only — this test asserts the surface exists.
    // Real adapters arrive in Phase A refactor.
    const shape: {
      storage?: StorageAdapter;
      scheduler?: SchedulerAdapter;
      trace?: TraceSink;
    } = {};
    expect(shape).toBeDefined();
  });
});
