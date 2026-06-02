---
name: OpenAPI/Orval codegen gotchas
description: Non-obvious rules when adding endpoints to lib/api-spec/openapi.yaml in this contract-first repo
---

# OpenAPI + Orval codegen gotchas

## Response schema name collisions (TS2308)
Orval auto-generates a zod export named `{operationId}Response` for every operation's
response. If you ALSO define a component schema with that same name in `openapi.yaml`,
the generated barrel re-exports both and the build fails with TS2308 (duplicate export).

**Rule:** never name a `components.schemas` entry `<OperationId>Response`. Pick a
distinct name (e.g. `RecalculateResult`, not `RecalculateAnalyticsResponse`).

**How to apply:** after editing the spec, run
`pnpm --filter @workspace/api-spec run codegen`, then check generated zod export names
in `lib/api-zod/src/generated/api.ts` before wiring routes — the exact names
(`Get<Op>Response`, `<Op>Params`, `<Op>Response`) are what server routes must `.parse()` with.

## Optional vs nullable fields in generated TS
Spec fields that are nullable-but-not-required generate as `topicId?: number | null`
(includes `undefined`). Frontend helper param types that consume generated response
objects must use `topicId?: number | null`, not `topicId: number | null`, or typecheck
fails with TS2345.
