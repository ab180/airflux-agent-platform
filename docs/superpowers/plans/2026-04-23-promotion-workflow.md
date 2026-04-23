# P7: Asset Promotion Workflow Implementation Plan

**Goal:** Implement the data model + HTTP surface for v2's killer differentiator — "promote an asset (agent/skill/tool/prompt) from a user's personal drawer into a team project through a reviewable request/approve cycle." Actual asset movement (moving an agent config between scopes) is deferred to a follow-up; this phase ships the *records + flow* that proves the UX.

**Out of scope:** Dashboard UI, notification/email, actual agent config relocation, conflict resolution when the same asset-id already exists at the destination.

**Architecture:** Single `asset_promotions` table with composite PK on id. PromotionStore SQLite adapter implements the runtime interface. Thin HTTP layer does RBAC checks (requester must own the drawer source; approver must be project maintainer).

**Tech Stack:** SQLite + better-sqlite3 (existing), Hono routes, Vitest.

---

## Task 1: Schema + SqlitePromotionStore

**Files:**
- Modify: `packages/server/src/store/collab/schema.ts` — add asset_promotions table
- Create: `packages/server/src/store/collab/sqlite-promotion-store.ts`
- Modify: `packages/server/src/store/collab/index.ts` — export
- Test: append to `packages/server/src/__tests__/sqlite-collab-store.test.ts`

### Steps
- [ ] Add table: id PK, asset_kind, asset_id, from_scope_kind, from_scope_ref, to_scope_kind, to_scope_ref, state CHECK, requested_by, reviewed_by, decided_at, notes, created_at
- [ ] Implement `SqlitePromotionStore` with `request`, `approve`, `reject`, `listPending(projectId)`
- [ ] Tests: round-trip, state transitions, listPending filters by project

## Task 2: HTTP routes

**Files:**
- Create: `packages/server/src/routes/promotions.ts`
- Modify: `packages/server/src/app.ts` — mount
- Test: create `packages/server/src/__tests__/promotions-route.test.ts`

### Routes
- `POST /api/promotions/request` — body: `{ assetKind, assetId, toProjectId, notes? }`. requester is current user; fromScope = their drawer; returns 201 + record.
- `GET /api/promotions?projectId=...` — returns pending promotions targeting that project; caller must be project member (any role).
- `POST /api/promotions/:id/approve` — caller must be `maintainer` of the target project. Transitions state to `published`, stamps `reviewed_by` + `decided_at`.
- `POST /api/promotions/:id/reject` — same RBAC as approve. Transitions to `deprecated` (no separate rejected state per interface).

### Tests
- request round-trip
- 403 when approver is not maintainer
- 404 when promotion id missing
- listing filters correctly

## Task 3: Verify green

- [ ] Full `npm run test` green
- [ ] `npm run build` green
- [ ] Single atomic commit

## Done criteria
- 7+ new tests, all previous tests still green
- Both store-level and route-level coverage
