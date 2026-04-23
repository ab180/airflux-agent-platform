import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // SQLite file at data/airflux.db is shared by every test that touches
    // a store. Parallel workers on the same file produce flaky DELETE/
    // INSERT interleaving. Keep the suite on a single fork until we swap
    // in per-worker DB paths or a memory adapter.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
