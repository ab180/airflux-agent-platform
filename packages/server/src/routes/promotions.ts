import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AssetPromotionRecord } from '@airflux/runtime';
import {
  SqliteMembershipStore,
  SqliteOrgStore,
  SqlitePromotionStore,
  SqliteProjectStore,
} from '../store/collab/index.js';
import { resolveTrustedUserId } from '../security/trusted-user.js';
import { getEnvironment } from '../runtime/environment.js';
import { getDb } from '../store/db.js';

export const promotionsRoute = new Hono();

const promotionStore = new SqlitePromotionStore();
const projectStore = new SqliteProjectStore();
const orgStore = new SqliteOrgStore();
const membershipStore = new SqliteMembershipStore();

function currentUser(headers: Headers): string {
  const env = getEnvironment();
  return env.runMode === 'local' ? 'local' : resolveTrustedUserId(headers, 'anonymous');
}

const ASSET_KINDS: readonly AssetPromotionRecord['assetKind'][] = [
  'agent', 'skill', 'tool', 'prompt',
] as const;

/**
 * Resolve the target project id of a promotion without exposing
 * getRecord on the store interface. Used to enforce maintainer RBAC.
 */
function lookupTargetProjectId(promotionId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT to_scope_ref AS ref FROM asset_promotions
       WHERE id = ? AND to_scope_kind = 'project'`,
    )
    .get(promotionId) as { ref: string } | undefined;
  return row?.ref ?? null;
}

/**
 * POST /api/promotions/request { assetKind, assetId, toProjectId, notes? }
 * Creates an under-review promotion from the caller's drawer into the target
 * project. Caller must belong to the target project's org.
 */
promotionsRoute.post('/promotions/request', async (c) => {
  let body: {
    assetKind?: unknown;
    assetId?: unknown;
    toProjectId?: unknown;
    notes?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const assetKind = ASSET_KINDS.find(k => k === body.assetKind);
  if (!assetKind) {
    return c.json(
      { error: `assetKind must be one of: ${ASSET_KINDS.join(', ')}` },
      400,
    );
  }
  const assetId =
    typeof body.assetId === 'string' && body.assetId.trim()
      ? body.assetId.trim()
      : null;
  if (!assetId) return c.json({ error: 'assetId is required' }, 400);

  const toProjectId =
    typeof body.toProjectId === 'string' && body.toProjectId.trim()
      ? body.toProjectId.trim()
      : null;
  if (!toProjectId) return c.json({ error: 'toProjectId is required' }, 400);

  const notes = typeof body.notes === 'string' ? body.notes : undefined;
  const userId = currentUser(new Headers(c.req.raw.headers));

  const project = await projectStore.getProject(toProjectId);
  if (!project) return c.json({ error: 'project not found' }, 404);

  const userOrgs = await orgStore.listOrgsForUser(userId);
  if (!userOrgs.some(o => o.id === project.orgId)) {
    return c.json({ error: 'not a member of the target project org' }, 403);
  }

  const record = await promotionStore.request({
    assetKind,
    assetId,
    fromScope: { kind: 'drawer', userId },
    toScope: { kind: 'project', projectId: toProjectId },
    requestedBy: userId,
    ...(notes !== undefined ? { notes } : {}),
  });
  return c.json(record, 201);
});

/**
 * GET /api/promotions?projectId=... — pending promotions for a project.
 * Caller must be a project member of any role.
 */
promotionsRoute.get('/promotions', async (c) => {
  const projectId = c.req.query('projectId');
  if (!projectId) return c.json({ error: 'projectId query param required' }, 400);

  const userId = currentUser(new Headers(c.req.raw.headers));
  const role = await membershipStore.userRoleInProject(userId, projectId);
  if (!role) {
    return c.json({ error: 'not a member of this project' }, 403);
  }

  const pending = await promotionStore.listPending(projectId);
  return c.json({ promotions: pending });
});

promotionsRoute.post('/promotions/:id/approve', (c) => handleTransition(c, 'approve'));
promotionsRoute.post('/promotions/:id/reject',  (c) => handleTransition(c, 'reject'));

async function handleTransition(c: Context, op: 'approve' | 'reject'): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'missing id' }, 400);

  let notes: string | undefined;
  try {
    const body = (await c.req.json()) as { notes?: unknown };
    if (typeof body?.notes === 'string') notes = body.notes;
  } catch {
    // body optional
  }

  const projectId = lookupTargetProjectId(id);
  if (!projectId) return c.json({ error: 'promotion not found' }, 404);

  const userId = currentUser(new Headers(c.req.raw.headers));
  const role = await membershipStore.userRoleInProject(userId, projectId);
  if (role !== 'maintainer') {
    return c.json({ error: 'only project maintainers can decide promotions' }, 403);
  }

  try {
    const rec =
      op === 'approve'
        ? await promotionStore.approve(id, userId, notes)
        : await promotionStore.reject(id, userId, notes);
    return c.json(rec, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) return c.json({ error: msg }, 404);
    if (/state/i.test(msg)) return c.json({ error: msg }, 409);
    throw err;
  }
}
