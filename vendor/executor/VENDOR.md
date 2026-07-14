# Executor vendor record

- Upstream: https://github.com/RhysSullivan/executor
- Pinned commit: `0a50c796c2cc334cf3e9bf6d4be33c77dbfac93b` (`0a50c79`)
- Vendored: 2026-07-14
- License: MIT, preserved in [`LICENSE`](LICENSE)

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

## Patch log

This log is the upstream-sync contract. Every local edit to an upstream vendored file must be recorded here.

### 2026-07-14

- Replaced every `catalog:` dependency reference with the corresponding concrete version from the pinned upstream root catalog. Effect-family dependencies were aligned to the Harnessy runtime at `4.0.0-beta.85`: `effect`, `@effect/platform-bun`, `@effect/platform-node`, `@effect/atom-react`, `@effect/vitest`, and `@effect/opentelemetry`. Modified manifests:
  - `apps/cli/package.json`
  - `apps/local/package.json`
  - `packages/app/package.json`
  - `packages/core/api/package.json`
  - `packages/core/cli/package.json`
  - `packages/core/config/package.json`
  - `packages/core/execution/package.json`
  - `packages/core/fumadb/package.json`
  - `packages/core/integrations-registry/package.json`
  - `packages/core/sdk/package.json`
  - `packages/core/test-servers/package.json`
  - `packages/core/vite-plugin/package.json`
  - `packages/hosts/cloudflare/package.json`
  - `packages/hosts/mcp/package.json`
  - `packages/kernel/core/package.json`
  - `packages/kernel/ir/package.json`
  - `packages/kernel/runtime-deno-subprocess/package.json`
  - `packages/kernel/runtime-dynamic-worker/package.json`
  - `packages/kernel/runtime-quickjs/package.json`
  - `packages/kernel/runtime-workerd-subprocess/package.json`
  - `packages/plugins/apps/package.json`
  - `packages/plugins/desktop-settings/package.json`
  - `packages/plugins/encrypted-secrets/package.json`
  - `packages/plugins/example/package.json`
  - `packages/plugins/file-secrets/package.json`
  - `packages/plugins/graphql/package.json`
  - `packages/plugins/keychain/package.json`
  - `packages/plugins/mcp/package.json`
  - `packages/plugins/onepassword/package.json`
  - `packages/plugins/openapi/package.json`
  - `packages/plugins/provider-service-split/package.json`
  - `packages/plugins/toolkits/package.json`
  - `packages/plugins/workos-vault/package.json`
  - `packages/react/package.json`
