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

Policy: vendored source stays verbatim EXCEPT the Harnessy rebrand overlay
below (Konan, 2026-07-14 — user-facing copy says Harnessy; functional
identifiers, package names, and tool addresses stay executor). Every patched
file is listed here; on upstream sync, re-copy verbatim and re-apply exactly
these edits.

Rebrand overlay (user-visible copy only):

- `packages/react/src/components/wordmark.tsx` — wordmark text `executor` -> `harnessy`
- `packages/react/src/api/local-auth.tsx` — auth card: `executor open` hint -> `hsy web` auth-URL hint
- `packages/app/index.html` — `<title>` Executor -> Harnessy
- `packages/react/src/lib/document-title.tsx` — `APP_NAME` -> Harnessy (all page titles)
- `packages/react/src/pages/api-keys.tsx` — API/MCP endpoint description copy
- `packages/react/src/components/add-account-modal.tsx` — OAuth DCR client display name (`Harnessy for <integration>`) + CIMD host copy
- `packages/react/src/components/add-account-modal.test.ts` — expectations updated to match the DCR client name
- `packages/react/src/components/oauth-app-setup.ts` — Slack app manifest display name
- `packages/app/src/web/server-connection-menu.tsx` — server selector aria-label
- `packages/react/src/components/mcp-install-card.tsx` — MCP install snippet registers the server as `--name harnessy` (the endpoint/CLI invocation stays functional-executor)
- `packages/react/src/components/mcp-install-card.test.ts` — expectations updated to the harnessy server name

Known upstream-branded surfaces deliberately NOT patched (deferred):

- update card command (`npm i -g executor@<channel>`) — wrong control either way for a vendored engine; needs a real Harnessy update story
- docs links to executor.sh — functional docs for engine features
- the built-in `Executor` integration (slug `executor`) — functional identity; renaming would change tool addresses

## Self-hosted app world (`hsy web`)

To run the vendored local web app (`apps/local`) as Harnessy's local test
cockpit, the vendor dir is made self-hosting. These are ADDED integration
files, not edits to vendored sources (vendored sources stay verbatim apart from the logged rebrand overlay; the added-files rule still holds for
every copied path):

- `package.json`, `bun.lock`, `tsconfig.json`, `turbo.json`, `patches/` —
  copied from upstream root at the pinned commit. One deviation, required for
  install: the `workspaces` array drops `e2e` and `examples/*` (those trees
  were not vendored).
- `bun install` is run inside `/executor` (bun, upstream's package
  manager; applies upstream's `patches/`). This creates
  `executor/node_modules` with upstream's own dependency graph,
  including its pinned `effect` — used ONLY when running the app
  self-contained.

`npm run build` produces `apps/local/dist`; then `npm run hsy:web` starts the
vendored daemon on `127.0.0.1:4788`, serves those static assets, and opens its
one-time `?_token=` auth URL. Normal Harnessy usage does not keep a Vite
development server running.

### Runtime-split guard

Source-level composition (harnessy-core tests importing vendored src) must
resolve `effect` to the repo root copy, never to
`executor/node_modules`. `packages/harnessy-core/vitest.config.ts`
enforces this with `resolve.dedupe`, and
`test/effect-identity-probe.test.ts` fails the suite if the module graph ever
splits into two effect instances again.
