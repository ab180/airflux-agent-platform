# P2: Skill Markdown Loader Implementation Plan

**Goal:** Add a markdown-with-frontmatter loader for skills in `@airflux/core`. Each skill can live as `skill-name.md` with YAML frontmatter for metadata and markdown body for prompt/instructions. Keeps existing `skills.yaml` loader untouched — this is purely additive.

**Architecture:** Small frontmatter parser (splits on `---` delimiters), YAML parsing via the existing `yaml` dep, validates returned `SkillDefinition`. Extended interface adds optional `triggers` + `instructions`.

**Tech Stack:** TypeScript, `yaml` (already installed in core), Vitest.

---

## Task 1: Extend SkillDefinition

**Files:** `packages/core/src/types/agent.ts`

- [ ] Add `triggers?: string[]` and `instructions?: string` to `SkillDefinition`. No other change.

## Task 2: Frontmatter parser

**Files:** Create `packages/core/src/config/frontmatter.ts` + test

- [ ] Write tests: parses `---\nkey: value\n---\nBODY`, handles missing frontmatter, handles malformed input.
- [ ] Implement `parseFrontmatter<T>(raw: string): { data: T; body: string }`.

## Task 3: loadSkillsFromMarkdownDir

**Files:** Create `packages/core/src/config/skill-md-loader.ts` + test

- [ ] Write tests using fs fixtures (tmpdir): loads all `*.md`, skips non-md, validates required fields, returns SkillDefinition[].
- [ ] Implement loader: glob `*.md`, parse frontmatter, construct SkillDefinition.

## Task 4: Export + build

- [ ] Export from `packages/core/src/index.ts`.
- [ ] Run full test/build, confirm green.

## Task 5: Example skill in repo (docs)

- [ ] Add `docs/design/capabilities/example-skill.md` showing the format. Non-executable reference.

## Done criteria

- Can call `loadSkillsFromMarkdownDir('/path')` and receive typed SkillDefinition[]
- Existing YAML loader untouched — all existing tests pass
- Loader + frontmatter have ≥6 tests total
