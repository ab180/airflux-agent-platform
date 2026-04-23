import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Explicit anchor file — place at repo root to mark where `airops` operates.
 * Takes precedence over legacy name match so projects can be renamed freely.
 */
const AIROPS_ANCHOR = 'airops.config.json';

/**
 * Legacy fallback: match the root package.json `name` against this list.
 * Kept so existing checkouts work without an anchor file. New setups should
 * drop an `airops.config.json` instead.
 */
const LEGACY_ROOT_NAMES = new Set(['airflux-agent-platform']);

/**
 * Walk up from `start` until we find the airops monorepo root, identified by
 * either an `airops.config.json` marker or a legacy package name. Lets `airops`
 * work from any subdirectory.
 *
 * Throws if not found — better than silently picking a wrong cwd and
 * spawning `npm run dev --workspace=...` against an unrelated project.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  while (true) {
    if (existsSync(resolve(dir, AIROPS_ANCHOR))) return dir;

    const pkgPath = resolve(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
          name?: string;
          airops?: unknown;
        };
        if (pkg.airops !== undefined) return dir;
        if (pkg.name && LEGACY_ROOT_NAMES.has(pkg.name)) return dir;
      } catch {
        // malformed package.json — keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `airops monorepo root를 찾을 수 없습니다. ` +
        `레포 루트에 '${AIROPS_ANCHOR}' 파일을 두거나 package.json에 "airops" 필드를 추가하세요 (cwd: ${start}).`,
      );
    }
    dir = parent;
  }
}
