import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT_PACKAGE_NAME = 'airflux-agent-platform';

/**
 * Walk up from `start` until we find a package.json whose `name` matches
 * the airflux monorepo root. Lets `airops` work from any subdirectory.
 *
 * Throws if not found — better than silently picking a wrong cwd and
 * spawning `npm run dev --workspace=...` against an unrelated project.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  while (true) {
    const pkgPath = resolve(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
        if (pkg.name === ROOT_PACKAGE_NAME) return dir;
      } catch {
        // malformed package.json — keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `'${ROOT_PACKAGE_NAME}' monorepo root를 찾을 수 없습니다. ` +
        `airops 는 이 레포 안에서만 실행 가능합니다 (cwd: ${start}).`,
      );
    }
    dir = parent;
  }
}
