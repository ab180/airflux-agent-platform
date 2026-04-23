import { Hono } from 'hono';
import type { Org, Project, ProjectType, ProjectVisibility } from '@airflux/runtime';
import {
  SqliteOrgStore,
  SqliteMembershipStore,
  SqliteProjectStore,
  SqliteDrawerStore,
} from '../store/collab/index.js';
import { resolveTrustedUserId } from '../security/trusted-user.js';
import { getEnvironment } from '../runtime/environment.js';
import { logAudit } from '../store/audit-log.js';

export const workspacesRoute = new Hono();

const orgStore = new SqliteOrgStore();
const membershipStore = new SqliteMembershipStore();
const projectStore = new SqliteProjectStore();
const drawerStore = new SqliteDrawerStore();

function currentUser(headers: Headers): string {
  const env = getEnvironment();
  return env.runMode === 'local' ? 'local' : resolveTrustedUserId(headers, 'anonymous');
}

const PROJECT_TYPES: readonly ProjectType[] = ['code-repo', 'docs', 'objective'] as const;
const PROJECT_VISIBILITIES: readonly ProjectVisibility[] = [
  'private', 'internal', 'public',
] as const;

function validateSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return null;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(slug)) return null;
  return slug.toLowerCase();
}

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
  const userId = currentUser(new Headers(c.req.raw.headers));

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

/**
 * GET /api/projects/:projectId — project detail + caller's role + members.
 * Caller must be a member of the project (any role).
 */
workspacesRoute.get('/projects/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const userId = currentUser(new Headers(c.req.raw.headers));

  const project = await projectStore.getProject(projectId);
  if (!project) return c.json({ error: 'project not found' }, 404);

  const role = await membershipStore.userRoleInProject(userId, projectId);
  if (!role) {
    return c.json({ error: 'not a member of this project' }, 403);
  }

  const members = await membershipStore.listProjectMembers(projectId);
  return c.json({
    project,
    callerRole: role,
    members,
  });
});

/**
 * POST /api/orgs { slug, name }
 * Creates an org with the caller as admin.
 */
workspacesRoute.post('/orgs', async (c) => {
  let body: { slug?: unknown; name?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const slug = validateSlug(body.slug);
  if (!slug) {
    return c.json({ error: 'slug must match /^[a-z0-9][a-z0-9-]{0,63}$/i' }, 400);
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const userId = currentUser(new Headers(c.req.raw.headers));

  try {
    const org = await orgStore.createOrg({ slug, name });
    await membershipStore.addOrgMember({ orgId: org.id, userId, role: 'admin' });
    logAudit({
      userId,
      action: 'org.create',
      resource: `org:${org.id}`,
      outcome: 'success',
      metadata: { slug: org.slug, name: org.name },
    });
    return c.json(org, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg)) {
      logAudit({
        userId, action: 'org.create', outcome: 'failure',
        metadata: { reason: 'duplicate slug', slug },
      });
      return c.json({ error: msg }, 409);
    }
    throw err;
  }
});

/**
 * POST /api/orgs/:orgId/projects { slug, name, type, visibility?, externalRef? }
 * Creates a project inside an org + makes the caller its maintainer.
 * Requires the caller to be an org member.
 */
workspacesRoute.post('/orgs/:orgId/projects', async (c) => {
  const orgId = c.req.param('orgId');
  const userId = currentUser(new Headers(c.req.raw.headers));

  const userOrgs = await orgStore.listOrgsForUser(userId);
  if (!userOrgs.some(o => o.id === orgId)) {
    return c.json({ error: 'not a member of this org' }, 403);
  }

  let body: {
    slug?: unknown;
    name?: unknown;
    type?: unknown;
    visibility?: unknown;
    externalRef?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const slug = validateSlug(body.slug);
  if (!slug) return c.json({ error: 'slug invalid' }, 400);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!name) return c.json({ error: 'name is required' }, 400);

  const type = PROJECT_TYPES.find(t => t === body.type);
  if (!type) {
    return c.json({ error: `type must be one of: ${PROJECT_TYPES.join(', ')}` }, 400);
  }
  const visibility =
    PROJECT_VISIBILITIES.find(v => v === body.visibility) ?? ('private' as ProjectVisibility);
  const externalRef = typeof body.externalRef === 'string' ? body.externalRef : undefined;

  try {
    const project = await projectStore.createProject({
      orgId,
      slug,
      name,
      type,
      visibility,
      ...(externalRef !== undefined ? { externalRef } : {}),
    });
    await membershipStore.addProjectMember({
      projectId: project.id,
      userId,
      role: 'maintainer',
    });
    logAudit({
      userId,
      action: 'project.create',
      resource: `project:${project.id}`,
      outcome: 'success',
      metadata: { orgId, slug: project.slug, type: project.type, visibility: project.visibility },
    });
    return c.json(project, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg)) {
      logAudit({
        userId, action: 'project.create', outcome: 'failure',
        metadata: { reason: 'duplicate slug', orgId, slug },
      });
      return c.json({ error: msg }, 409);
    }
    throw err;
  }
});
