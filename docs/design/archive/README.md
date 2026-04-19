# Design Archive

This directory preserves design documents that are no longer part of the
active roadmap but contain reasoning we may revisit.

## When to move a doc here

- The feature is explicitly ARCHIVED in
  `docs/design/reference/03-config-schemas.md` or `docs/FROZEN.md`.
- The design references a module that no longer exists or was superseded.
- A decision was made not to pursue the work in the next 6 months.

## Move protocol

1. `git mv docs/design/<section>/<file>.md docs/design/archive/<section>-<file>.md`
2. Prepend a top-line note explaining why archived and date:
   ```markdown
   > **ARCHIVED 2026-MM-DD**: <reason>. See `docs/design/<active-doc>.md`
   > for the current direction.
   ```
3. Update any cross-references in active docs to point to the archive path.
4. Commit with a message starting `docs(archive):`.

## Current archive

Entries are listed as docs are moved — see git history for details.
