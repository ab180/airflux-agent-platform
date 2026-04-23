import { Hono } from 'hono';
import type { Org, Project } from '@airflux/runtime';
import {
  SqliteOrgStore,
  SqliteProjectStore,
  SqliteDrawerStore,
} from '../store/collab/index.js';
import { resolveTrustedUserId } from '../security/trusted-user.js';
import { getEnvironment } from '../runtime/environment.js';

export const workspacesRoute = new Hono();

const orgStore = new SqliteOrgStore();
const projectStore = new SqliteProjectStore();
const drawerStore = new SqliteDrawerStore();

/**
 * GET /api/workspaces
 *
 * Returns the current user's orgs + projects + drawer. The backbone for
 * the dashboard workspace switcher.
 *
 * In local mode the user id is always 'local' (the bootstrap step
 * pre-creates a 'personal' org for it). In team mode the id comes from
 * the trusted-user header.
 */
workspacesRoute.get('/workspaces', async (c) => {
  const env = getEnvironment();
  const userId =
    env.runMode === 'local'
      ? 'local'
      : resolveTrustedUserId(new Headers(c.req.raw.headers), 'anonymous');

  const orgs = await orgStore.listOrgsForUser(userId);
  const projectsByOrg: Record<string, Project[]> = {};
  for (const org of orgs) {
    projectsByOrg[org.id] = await projectStore.listProjects(org.id);
  }
  const drawer = await drawerStore.ensureDrawer(userId);

  return c.json<{
    userId: string;
    runMode: typeof env.runMode;
    drawer: typeof drawer;
    orgs: Array<Org & { projects: Project[] }>;
  }>({
    userId,
    runMode: env.runMode,
    drawer,
    orgs: orgs.map((o) => ({ ...o, projects: projectsByOrg[o.id] ?? [] })),
  });
});
