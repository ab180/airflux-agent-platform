/**
 * StorageAdapter — shape the runtime will require from any storage backend
 * (SQLite for `--local`, Postgres/MySQL/managed for `--team`).
 *
 * This file intentionally declares only the interface. Concrete adapters
 * (SQLite, Postgres) will live alongside this module as separate submodules
 * once the server's existing stores are migrated into @airflux/runtime.
 *
 * See docs/superpowers/specs/2026-04-23-airops-platform-vision.md §Phase A
 * for the migration plan.
 */

export interface StorageAdapter {
  readonly kind: 'sqlite' | 'postgres' | 'mysql';
  readonly url: string;

  init(): Promise<void>;
  close(): Promise<void>;
}
