# Why Not Just Use Dust?

> **Purpose**: make the case for building Airflux instead of adopting Dust.tt.
> Without this document, the project's justification is vibes-based and
> collapses the first time leadership asks "why did we build this?"

## Three real reasons

### 1. Data sovereignty

All queries against Snowflake, dbt, internal event stores, and the
Airbridge attribution tables happen inside AB180's AWS. Dust would
require shipping query text and (worse) query results to a SaaS vendor.
For marketing attribution data — client PII, conversion events, revenue
— this is a compliance concern under PIPA (개인정보보호법).

**Test for this claim**: list every data source an agent touches. For
each, check whether Dust's DPA covers that data class and whether the
client has signed off on third-party processing. Expected: several fail.

### 2. Domain fit (Korean + AB180 semantic layer)

- Korean time expressions ("지난 주", "어제", "이번 달 초") normalized
  in `packages/core/src/utils/korean-time.ts` — Dust's assistants are
  English-centric and degrade on Korean time reasoning.
- Airbridge/AB180 metric glossary (DAU, IAA, IAP, 광고 ROAS, 리텐션) in
  `settings/domain-glossary.yaml` — Dust has no domain-specific lexicon
  for Korean ad-tech.
- dbt semantic layer metric resolution via `settings/semantic-layer.yaml`
  + `getSemanticLayer` tool — Dust offers generic SQL tools without
  first-class dbt integration.

### 3. Cost control granularity

Per-token tracking, agent-level budgets, and runtime guardrails
(prompt-injection, PII, read-only SQL) are enforced in
`packages/server/src/llm/cost-tracker.ts` and
`packages/core/src/guardrails/built-in.ts`. Dust charges per seat with
usage pass-through; at AB180's planned size (~30 active users within
1 year) the economics shift depending on how heavy usage actually is.

## Cost comparison (fill in with real numbers)

| Assumption | Value |
|-----------|-------|
| Dust Team plan (public pricing as of 2026-04) | **TODO** — verify |
| Active users (1-year projection) | 30 |
| Dust annual cost | **TODO** — list × users × 12 |
| Airflux annual infra (Lambda + Bedrock + Snowflake reads) | ~$3,600 estimate |
| Airflux annual maintenance (0.25 FTE × AB180 hour rate × 200 days) | **TODO** — fill in |
| **Break-even point** | **TODO** — when maintenance FTE ≥ Dust delta |

At typical AB180 salary levels a 0.25 FTE investment is already ≥ $3,600,
so **this is not primarily a cost-savings project**.

## The honest positioning

Airflux exists because:

1. Dust cannot be made compliant with AB180's data handling requirements
   for attribution / PII data.
2. Korean + AB180 domain expertise is expected to yield 30–50% quality
   uplift on marketing analytics queries — **this claim must be validated
   by the evaluation pipeline** (see `docs/superpowers/plans/` Epic 4).
3. Self-hosted extensibility (custom skills/tools for dbt, Snowflake,
   Slack-native workflows, MCP per-user integrations) is strategically
   important and not available via Dust.

Airflux is **not** primarily a money-saving project. Leadership should
set expectations accordingly.

## Kill criteria

Switch to Dust when all three become true:

1. Dust offers a deployment model that satisfies PIPA data residency
   (e.g. self-hosted appliance, EU/KR region with client-specific KMS).
2. Domain-specific quality advantage (measured by the evaluation
   pipeline) falls below 10% over 3 consecutive monthly runs.
3. Internal maintenance cost exceeds 0.5 FTE — a signal that we are
   over-building or the product has drifted from its narrow value
   proposition.

Review this document annually, or whenever Dust announces pricing or
deployment changes.

## Related

- `docs/local-vs-prod-matrix.md` — how local dev maps to production
- `docs/FROZEN.md` — features paused to keep scope focused
- `docs/design/architecture/00-vision.md` — original vision (still valid)
