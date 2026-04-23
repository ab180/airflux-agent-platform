# P4 Phase 1: Collab SQLite Adapter — Org + Membership

**Goal:** Implement the first concrete `OrgStore` + `MembershipStore` adapters against SQLite, using the interfaces declared in `@airflux/runtime/collab`. This is the minimal slice that proves the v2 collaboration data model works end-to-end: create an org, add members, list a user's orgs.

**Out of scope:** Project/Drawer/Promotion/ACL (Phase 2/3), HTTP routes (Phase 4), auth middleware (Phase 5).

**Architecture:** Tables live in the existing SQLite DB (opened via `packages/server/src/store/db.ts`). Adapters are in `packages/server/src/store/collab/` (server-side for now; migrate to `packages/runtime/storage/adapters/sqlite/` later when more adapters exist). Schema created via `ensureTables()` lazy init — same pattern as other stores.

---

## Task 1: Schema + Org INSERT/GET

**Files:**
- Create: `packages/server/src/store/collab/sqlite-org-store.ts`
- Test: `packages/server/src/__tests__/sqlite-org-store.test.ts`

### Steps

- [ ] Write failing test for `createOrg` + `getOrg` round-trip
- [ ] Implement `ensureTables()` creating `orgs` table
- [ ] Implement `createOrg` (INSERT + return with generated id + timestamp)
- [ ] Implement `getOrg` (SELECT by id, null if missing)
- [ ] Tests pass

## Task 2: Membership + listOrgsForUser

### Steps
- [ ] Extend `ensureTables` to add `org_memberships` table
- [ ] Write test: add member, listOrgsForUser returns the org
- [ ] Implement `addOrgMember` (INSERT, ignore duplicates)
- [ ] Implement `listOrgsForUser` (JOIN)
- [ ] Tests pass

## Task 3: Uniqueness + slug constraints

- [ ] Test: creating two orgs with same slug fails
- [ ] Add UNIQUE(slug) constraint; adapter translates SQLITE_CONSTRAINT into a domain error

## Task 4: Hook up to runtime + verify

- [ ] Export `SqliteOrgStore` + `SqliteMembershipStore` classes from `packages/server/src/store/collab/index.ts`
- [ ] Verify full build + test green

## Done criteria
- OrgStore + MembershipStore interfaces (from `@airflux/runtime/collab`) implemented against SQLite
- ≥6 tests pass
- No regression in existing 250+ server tests
