# ab180-extensions/ — OSS split boundary

This directory is the only place in the server that may depend on
Airbridge / Snowflake / Korean business terminology.

> Reader summaries of the same boundary live in
> [`README.md`](../../../../README.md#oss-split-경계--ab180-extensions) and
> [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md#oss-split-boundary--ab180-extensions).
> This file is the authoritative source for the rules below; the other
> two stay in sync with it.

## Rules

- **No import from here in generic code.** `bootstrap.ts` is allowed to
  dynamically import this module, but only behind the `hasAb180Config()`
  gate. Routes, stores, and agent runtime code must stay domain-neutral.
- **No domain leaks out.** Tool names, labels, error messages, and
  prompts that reference Airflux / Airbridge / Snowflake specifically
  live here. Generic tools go in `registerBuiltInTools()` in
  `bootstrap.ts`.
- **Additive only.** `registerAb180Tools()` calls `ToolRegistry.register`
  with new tool ids. It must not mutate or override generic tools.
- **Config sources are optional.** Every loader uses
  `loadConfigOptional` with a safe default; the module must not throw
  when the underlying YAML files are empty or missing.

## Migration target

When the airops OSS package is published, this directory moves out to a
private `@airops-ab180/tools` package. The cut happens at this file's
boundary:

```
// in ab180/airflux-reference (private):
import { registerAb180Tools, hasAb180Config } from '@airops-ab180/tools';
```

The generic airops package publishes `hasConfig<T>` + a plugin surface
that the ab180 package plugs into via its own `register` entry point.
Today the gate lives inline in `bootstrap.ts`; after extraction it
becomes a normal plugin load.

## Current tool inventory

| Tool | Purpose | Config dependency |
|---|---|---|
| `queryData` | Snowflake cost-tier routing (tens/millions/billions) | none (heuristic) |
| `searchDocs` | grep `docs/design/`, `settings/`, `CLAUDE.md` | filesystem |
| `lookupTerm` | Korean business term → standard term | `domain-glossary.yaml` |
| `findTermsInQuery` | extract all known terms from a query | `domain-glossary.yaml` |
| `getSemanticLayer` | Airbridge Snowflake schema overview | `semantic-layer.yaml` |
| `getTableSchema` | specific table columns | `semantic-layer.yaml` |
| `getMetricSQL` | DAU/MAU/revenue SQL templates | `semantic-layer.yaml` |

## Testing contract

`__tests__/ab180-extensions.test.ts` verifies:
1. `hasAb180Config` detects either YAML file.
2. All 7 tools are registered on the shared `ToolRegistry`.
3. `queryData`'s 역질의 guard still fires when `app_id` is missing on
   billions/millions-tier queries.
4. `getSemanticLayer` returns the expected shape.

Any new AB180 tool added here should gain at least one contract test.
