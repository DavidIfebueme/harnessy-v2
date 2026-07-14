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
- `semver` `7.8.0`
- `tldts` `7.0.28`
- `zod` `4.3.6`

## Local patch log

None. Integration changes live outside the verbatim upstream paths.

## Self-hosted app world (`hsy web`)

To run the vendored local web app (`apps/local`) as Harnessy's local test
cockpit, the vendor dir is made self-hosting. These are ADDED integration
files, not edits to vendored sources (the zero-patch policy still holds for
every copied path):

- `package.json`, `bun.lock`, `tsconfig.json`, `turbo.json`, `patches/` —
  copied from upstream root at the pinned commit. One deviation, required for
  install: the `workspaces` array drops `e2e` and `examples/*` (those trees
  were not vendored).
- `bun install` is run inside `engine/` (bun, upstream's package
  manager; applies upstream's `patches/`). This creates
  `engine/node_modules` with upstream's own dependency graph,
  including its pinned `effect` — used ONLY when running the app
  self-contained.

Start it from the repo root: `npm run hsy:web` (vite dev on
`127.0.0.1:4788`, prints a one-time `?_token=` auth URL; engine data lives in
`~/.harnessy/engine-dev` via `EXECUTOR_DATA_DIR`).

### Runtime-split guard

Source-level composition (harnessy-core tests importing vendored src) must
resolve `effect` to the repo root copy, never to
`engine/node_modules`. `packages/harnessy-core/vitest.config.ts`
enforces this with `resolve.dedupe`, and
`test/effect-identity-probe.test.ts` fails the suite if the module graph ever
splits into two effect instances again.
