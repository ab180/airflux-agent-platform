/**
 * Scheduler — placeholder. Current scheduler lives in `packages/server`.
 * Will be migrated here once the server's runtime concerns are split out.
 *
 * See docs/superpowers/specs/2026-04-23-airops-platform-vision.md Round 9
 * (scheduler placement decision).
 */

export interface SchedulerAdapter {
  register(agentId: string, cron: string): Promise<void>;
  unregister(agentId: string): Promise<void>;
  tick(): Promise<void>;
}
