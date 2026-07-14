# Executor vendor record

- Upstream: https://github.com/RhysSullivan/executor
- Pinned commit: `0a50c796c2cc334cf3e9bf6d4be33c77dbfac93b` (`0a50c79`)
- Vendored: 2026-07-14
- License: MIT, preserved verbatim in [`LICENSE`](LICENSE)

## Verbatim policy

The taken upstream paths are byte-identical to the pinned commit. Do not rewrite dependency protocols, versions, source, tests, or configuration inside these paths:

- `packages/*`
- `apps/local`
- `apps/cli`
- `LICENSE`

Upstream `catalog:` and `workspace:` references are intentionally preserved. Executor packages are not npm workspace members in Harnessy.

## Included

- All upstream `packages/*`
- `apps/local`
- `apps/cli`
- Root `LICENSE`

## Excluded

- `apps/marketing`
- `apps/docs`
- `apps/desktop`
- `apps/cloud`
- `apps/host-cloudflare`
- `apps/host-selfhost`
- Root `e2e`, `examples`, and `tests`
- `node_modules`
- `.git`

## Integration

Harnessy composes Executor at source level through root `tsconfig.json` path aliases. The aliases point `@executor-js/sdk`, its Effect subpaths, FumaDB, integrations-registry, plugin-openapi, and plugin-mcp at their vendored TypeScript entry points. All vendored imports resolve `effect` from Harnessy's root installation (`4.0.0-beta.85`), giving one Effect runtime without modifying upstream files.

Executor source dependencies added to the Harnessy root are pinned exactly:

- `@cfworker/json-schema` `4.1.1`
- `@libsql/client` `0.17.3`
- `@modelcontextprotocol/sdk` `1.29.0`
- `@paralleldrive/cuid2` `3.3.0`
- `@standard-schema/spec` `1.1.0`
- `@types/js-yaml` `4.0.9` (development)
- `@types/semver` `7.7.1` (development)
- `drizzle-orm` `0.45.2`
- `fractional-indexing` `3.2.0`
- `js-yaml` `4.1.1`
- `kysely` `0.28.17`
- `oauth4webapi` `3.8.5`
- `openapi-types` `12.1.3`
- `semver` `7.8.5`
- `tldts` `7.0.28`
- `zod` `4.3.6`

## Local patch log

None. Integration changes live outside the verbatim upstream paths.
