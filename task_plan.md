# Jarvis Protocol → Effect Migration Plan

## Goal

Replace the Python Jarvis engine with a native Effect implementation inside Harnessy while preserving user-visible behavior, persisted data, connector semantics, and agent-native access through `hsy`.

## Success shape

```text
Python Jarvis (compatibility oracle)
        ↓ golden contracts
Effect Jarvis domain services
        ↓
Harnessy CLI + hsy tools/commands + optional channel daemons
        ↓
Python shim removed only after verified parity
```

## Non-goals

- Do not transliterate Click, Rich, Pydantic, or Python singleton patterns.
- Do not port the deprecated `AnyTypeClient` or duplicate root `models.py`.
- Do not put Android, tmux, cloudflared, or Obsidian launching into the core runtime.
- Do not silently relocate or rewrite existing `~/.jarvis` and project `.jarvis` data.
- Do not enable connector or outbound writes until the deferred authorization/audit GitHub issue is resolved and adopted.

## Resolved architecture decisions

- [x] **State authority:** use `~/.harnessy` as the canonical store. If legacy `~/.jarvis` or project `.jarvis` data exists, detect and import it through an explicit compatibility migration; do not continue writing to legacy locations.
- [x] **CLI ownership:** expose migrated capabilities through `hsy`; do not create or retain a standalone `jarvis` binary.
- [x] **Agent surface:** preserve domain capabilities without reproducing the approximately 89-command Click tree as tools. Use a small set of typed domain tools, user-invoked slash commands, and workflow skills as defined below.
- [x] **Write policy:** defer approval, grant, and mutation-audit design to a dedicated GitHub issue. Create that issue as the first execution task; keep connector, outbound, publishing, bulk, and destructive writes disabled until its policy is adopted.
- [x] **Notion transport:** prefer Notion's official hosted MCP for OAuth-delegated interactive access, with direct Effect HTTP as the headless/service and unsupported-operation fallback. Normalize both behind one Harnessy connector contract; never expose raw Notion MCP tools directly to the agent.
- [x] **Daemon boundary:** run Fathom and WhatsApp receivers as separate deployable packages. Keep signature verification, normalization, inbox state, and connector contracts in shared core services; do not run persistent receivers inside the interactive `hsy` process.
- [x] **Compatibility window:** use milestone-gated native-default, no-default-Python, and legacy-retirement releases. Preserve an offline, audited rollback path without a shared mutable dual-write period.

### Agent surface

A narrow tool surface reduces schema selection errors, duplicated policy logic, prompt cost, and accidental use of administrative commands. It does **not** remove the underlying capabilities.

**Typed `hsy` tool families:**

| Tool family | Agent operations |
| --- | --- |
| `hsy_context` | Resolve, load, inspect, and search global/project context |
| `hsy_tasks` | Query, create, update, complete, prioritize, and tag tasks |
| `hsy_knowledge` | Discover capabilities/spaces and search, get, create, or update backend objects |
| `hsy_journal` | List, read, search, and write journal entries or quick notes |
| `hsy_planning` | Analyze workload; generate, inspect, and apply saved plans or suggestions |
| `hsy_wiki` | Inspect, search, ask, ingest, compile, and export wiki domains |
| `hsy_channels` | Ingest meetings; inspect Fathom records, channel inboxes, and WhatsApp threads; request sends after the deferred write-policy gate is implemented |
| `hsy_sync` | Build deterministic sync/dedupe/prune plans and inspect state; execution remains disabled until the deferred write-policy gate is implemented |

Tools return typed data and evidence; they do not render Rich-style presentation or expose aliases. Read-only and planning surfaces can ship before the deferred write-policy design; mutating operations cannot.

**Slash commands:** provide user-invoked shortcuts for frequent interactive intents: `/capture`, `/journal`, `/plan`, `/wiki`, `/meeting`, `/inbox`, `/sync`, and `/hsy-status`. Slash commands may collect missing input or show a preview, then call the same domain services and policy layer as tools.

**Skills:** compose multi-step or judgment-heavy workflows: workload rebalance/reorganize, reading-list research and write-back, content preparation and publishing, wiki research/enhancement/dedupe, meeting ingestion/routing, WhatsApp inbox triage/reply, and folder sync/prune. Skills contain workflow guidance, not duplicate connector implementations.

**CLI-only administrative and scripting surface:** configuration/init, backend authentication, capability diagnostics, migration/rollback, daemon setup/status, webhook registration, sync preset administration, cache maintenance, optional host capabilities, generated docs, JSON output, and shell completion.

**Intentionally retired or extracted rather than ported as domain tools:**

- Retire aliases (`w`, `j`, `t`, `o`, `rl`, `apk`, `p`, and `n`) as distinct protocol/tool nodes. Temporary `hsy` CLI aliases may exist only during the compatibility window.
- Replace `jarvis docs` with generated `hsy` CLI, tool-schema, slash-command, and skill documentation.
- Retire the deprecated `AnyTypeClient`, duplicate root `models.py`, Python singleton registry, Click/Rich presentation internals, and direct Anthropic-only execution.
- Extract Android/APK, tmux, cloudflared, shell-profile mutation, and Obsidian launch/open behavior into optional host capabilities.
- Move `webhook serve` and combined `fathom start` process management out of core and into the channel daemon packages plus optional local supervision helpers.

No task, journal, planning, knowledge, reading-list, content, sync, wiki, meeting, Fathom, or WhatsApp domain group is dropped solely to make the tool surface smaller. A feature may be retired only when the parity manifest marks it `intentionally retired` with a replacement or rationale.

### Deferred write authorization and audit policy

Approval UX, scoped grants, idempotency requirements, mutation auditing, and agent-versus-operator boundaries are intentionally deferred to [#48](https://github.com/Flow-Research/harnessy-v2/issues/48).

Until the issue is resolved and its policy is implemented:

- Read-only connector, context, compatibility, planning, dry-run, and inspection work may proceed.
- Connector mutations, outbound sends, publishing, bulk apply, sync execution, dedupe deletion, and prune remain disabled.
- Domain contracts must leave an explicit policy seam rather than embedding temporary confirmation behavior.

### Notion connector transport

Use one semantic Notion connector with two transports:

```text
hsy domain service
    ↓ policy seam + idempotency/audit metadata seam
Notion connector contract
    ├─ Hosted Notion MCP — preferred OAuth-delegated interactive transport
    └─ Direct Effect HTTP — headless/service and unsupported-operation fallback
```

Hosted MCP requirements:

- Connect to `https://mcp.notion.com/mcp` with Streamable HTTP.
- Implement OAuth 2.0 with PKCE, token refresh, secure credential storage, expiry handling, and explicit reauthorization state.
- Treat access tokens as short lived and refresh grants as revocable/expiring; never assume permanent authorization.
- Discover capabilities and adapt semantic operations to current MCP schemas instead of exposing or hard-coding raw tool names.
- Add drift tests that fail clearly when tool inputs/outputs or identifiers change, including database/data-source schema evolution.
- Never let the agent call Notion MCP directly because that would bypass Harnessy connector contracts and the deferred policy seam.

Direct Effect HTTP remains required for noninteractive/headless deployments, service credentials, unsupported MCP operations, deterministic low-level recovery, and compatibility where hosted MCP cannot satisfy the shared contract. Notion's local MCP bearer-token mode is not a primary target because it is not the actively supported path and may be retired.

### Channel daemon packages

Create two workspace packages:

- `packages/fathom-webhook` → `@harnessy/fathom-webhook`
- `packages/whatsapp-webhook` → `@harnessy/whatsapp-webhook`

The packages are thin Effect HTTP executables responsible for configuration/secrets, bounded request handling, challenge/signature verification, health/readiness, telemetry, graceful shutdown, and durable inbox handoff. Shared Fathom/WhatsApp schemas, signature functions, normalization, idempotency, inbox transitions, thread projection, and connector clients remain under `packages/harnessy-core/src/jarvis/channels/`.

Receivers archive a verified envelope before acknowledging success. Domain ingestion runs from the durable inbox and is restart-safe. The packages can run under a container, systemd/launchd, or another supervisor. Optional `hsy daemon install|start|stop|status|logs` commands manage local deployments but do not make the interactive process the supervisor. Tunnel launching remains an optional host capability.

### Compatibility and rollback lifecycle

Compatibility is complete only when the manifest, state migration, and rollback gates pass; source-line parity is not required. Jarvis contains substantial duplicated CLI/presentation and adapter code, so Effect should preserve contracts while consolidating implementation.

1. **Legacy-default release:** Python remains the default compatibility oracle. Native services are opt-in/read-only against copied fixtures and copied user state.
2. **Native-default release:** migration takes a timestamped immutable legacy backup, imports into `~/.harnessy`, validates counts/hashes/decoding, writes a migration receipt and store-owner marker, then enables native writes. Python remains installed but inactive as an explicit fallback. Python and Effect never write the same live store.
3. **No-default-Python release:** stop installing Python/uv on clean installs and upgrades only after all supported manifest entries are `compatible` or explicitly waived/retired, golden and live opt-in contracts pass, migration and rollback drills pass, and the native-default release has no unresolved severity-1/2 data-loss regression. Publish and pin the final legacy artifact separately.
4. **Legacy-retirement release:** remove the generated Python shim and runtime checks after at least one stable no-default-Python release and a successful restore/replay drill. Keep legacy readers, migration receipts, backup detection, and documented manual recovery for persisted data.

Rollback is offline and explicit:

1. Stop channel daemons and acquire the canonical store lock.
2. Back up current native state and mutation audit log.
3. Restore the immutable pre-cutover legacy backup into a new rollback directory, never over the only backup.
4. Replay post-cutover compatible mutations through versioned legacy exporters; report and require resolution of any non-exportable native feature.
5. Run Python read-only validation plus record-count/hash checks.
6. Atomically switch the store-owner marker, pin the final legacy artifact, and only then permit Python writes.

Automatic rollback is blocked if replay would lose data. There is no mutable dual-write mode, and rollback never silently discards post-cutover native changes.

## Phase 0 — Freeze the compatibility oracle

- [x] Open and link the deferred GitHub issue for mutation authorization, approvals, scoped grants, idempotency, and auditing: [#48](https://github.com/Flow-Research/harnessy-v2/issues/48).
- [x] Add a deterministic Python command-tree exporter based on the live Click tree.
- [x] Commit a canonical command manifest covering aliases, arguments, options, defaults, and help.
- [x] Fix `jarvis docs --json`; it currently omits implemented command groups.
- [x] Inventory and fixture every persisted JSON/YAML/Markdown format.
- [x] Capture adapter capability matrices and typed failure behavior.
- [x] Select representative Python tests as cross-runtime golden fixtures.
- [x] Add a parity dashboard that reports `missing`, `partial`, `compatible`, or `intentionally retired` by feature and records the approved replacement/rationale for every retirement.

**Exit gate:** the migration can detect a removed command, changed default, state incompatibility, or error-contract regression without manual review.

## Phase 1 — Effect compatibility kernel

- [x] Create `packages/harnessy-core/src/jarvis/` with domain, config, storage, compatibility, and extension boundaries.
- [ ] Port Pydantic domain models to `Schema.Class` without duplicate legacy model families.
- [ ] Port backend exceptions to specific `Schema.TaggedErrorClass` types rather than one generic error.
- [x] Implement Jarvis path resolution as an injected service; no module-load `homedir()` constants.
- [x] Decode `~/.jarvis/config.yaml` plus `JARVIS_*` environment overrides.
- [x] Port global/folder context loading, 12 standard files, override semantics, and `{{global}}` expansion.
- [x] Implement bounded versioned readers for config, pending suggestions, plans, journal state, sync state, presets, caches, wiki state, and channel inboxes; writers remain deferred behind #48.
- [ ] Add corruption-safe parsing, atomic writes, file locking where concurrent webhook/agent access is possible, and migration backups.

**Exit gate:** Effect reads existing Jarvis configuration/context/state fixtures without modifying them and reproduces Python decode/merge results.

## Phase 2 — Knowledge backend contract

- [x] Replace the Python 23-method `KnowledgeBaseAdapter` with focused Effect services instead of one oversized interface.
- [x] Separate connection/capability discovery, spaces, tasks, journal, tags, objects, collections, and files.
- [ ] Expand the current read-only AnyType connector to required CRUD and sync operations.
- [ ] Implement the Notion connector with hosted MCP as the preferred OAuth-delegated interactive transport and direct Effect HTTP as the headless/service and unsupported-operation fallback.
- [ ] Normalize MCP and HTTP behind the same semantic operations, property mapping, capability discovery, typed failures, and policy/idempotency/audit metadata seam.
- [ ] Implement OAuth 2.0 + PKCE, refresh, secure token storage, expiry/reauthorization state, and revocation handling for hosted MCP.
- [ ] Port retry behavior with `Schedule`, typed retryability, server-provided retry delays, and cancellation.
- [ ] Add contract suites that every backend layer and both Notion transports must pass.
- [ ] Add MCP discovery/schema-drift tests that detect changed tools, inputs, outputs, and identifier conventions without hard-coding today's tool names.
- [x] Keep all mutation methods disabled until the deferred authorization/audit issue is resolved and implemented.

**Exit gate:** AnyType and both Notion transports pass the same read contract for supported capabilities; unsupported capabilities fail with typed evidence, MCP schema drift is detected, and no write bypass exists.

## Phase 3 — Core personal-agent workflows

- [ ] Port tasks: create, query, update, completion, priorities, tags, and natural-language due dates.
- [ ] Port workload analysis, suggestions, apply, rebalance, and reorganize.
- [ ] Port calendar provider contract, plan generation, and plan application.
- [ ] Port generic object get/edit and URL/ID normalization.
- [ ] Port journal write/list/read/search/insights, draft recovery, and deep dives.
- [ ] Port saved plans and quick-note capture.
- [ ] Route AI work through the active Pi/Harnessy model runtime rather than direct Anthropic-only clients.

**Exit gate:** golden task, plan, object, journal, and note scenarios match Python outputs and state transitions.

## Phase 4 — Local knowledge operations

- [ ] Port reading-list parsing, fetching, caching, prioritization, extraction, and write-back.
- [ ] Port text-hygiene scanning and cleaning with protected Markdown regions.
- [ ] Port content frontmatter, hierarchy, package, verify, status, migration, strategy, approval, and publishing workflows.
- [ ] Port the six-method sync backend contract.
- [ ] Port deterministic folder walking, hashing, dry-run, incremental update, upload/stub modes, dedupe, prune, presets, and state recovery.
- [ ] Represent destructive sync/publish actions as deterministic reviewable plans, but keep execution disabled behind the deferred write-policy gate.

**Exit gate:** dry-run operation lists and state files match Python fixtures; destructive execution remains unavailable until the deferred policy issue is implemented.

## Phase 5 — Wiki engine

- [ ] Port wiki schemas, domain layout, manifests, seeds, program files, parser, formatters, indexes, lint, and Obsidian URL generation.
- [ ] Replace `WikiBackend` with an Effect AI service and optional agent-session research service.
- [ ] Port compile, ingest, search, ask, QA, enhance, research, dedupe, export, and usage accounting.
- [ ] Preserve prompt behavior through golden prompt fixtures while removing provider-specific execution from domain logic.
- [ ] Preserve `~/.jarvis/wikis/<domain>` compatibility and wiki-link formatting rules.

**Exit gate:** representative domains compile, lint, query, dedupe, and reopen identically from existing state.

## Phase 6 — Meetings and channels

- [ ] Port generic transcript parsing, normalization, destination routing, and idempotency.
- [ ] Port Fathom account selection, API client, polling watermark, ingest-today, and webhook administration.
- [ ] Port Fathom signature verification and inbox state transitions.
- [ ] Port WhatsApp account configuration, Meta client, signature verification, inbox processing, thread projection, service-window checks, sends, and templates.
- [ ] Create `@harnessy/fathom-webhook` and `@harnessy/whatsapp-webhook` as thin Effect HTTP executables with scoped lifetimes, graceful shutdown, bounded bodies, constant-time signature checks, health endpoints, and structured telemetry.
- [ ] Put shared channel schemas, verification, normalization, idempotency, inbox transitions, thread projection, and clients in `harnessy-core`; keep HTTP lifecycle, secrets, and durable handoff in the daemon packages.
- [ ] Add optional `hsy daemon install|start|stop|status|logs` local supervision commands without making the interactive process the supervisor.

**Exit gate:** signed webhook fixtures, replay/idempotency tests, inbox transitions, and thread projections match Python behavior without real outbound sends in unit tests.

## Phase 7 — Optional capability extraction

- [ ] Package Android emulator/APK operations as an optional capability.
- [ ] Package tmux, cloudflared, shell-profile mutation, and Obsidian opening as explicit host capabilities.
- [ ] Keep provider CLI adapters optional; prefer the native Pi model runtime.
- [ ] Document platform and permission requirements for each extracted capability.

**Exit gate:** core Jarvis has no hidden dependency on Android SDKs, tmux, cloudflared, desktop apps, or provider CLIs.

## Phase 8 — Agent-native surface and cutover

- [ ] Expose the eight typed `hsy` tool families and the shared policy seam defined above rather than one tool per CLI command.
- [ ] Add the eight user-invoked slash commands and workflow skills defined above; keep administrative/setup operations CLI-only.
- [ ] Preserve required human/script CLI behavior, JSON output, exit behavior, and shell completion; retain aliases only temporarily where the compatibility manifest requires them.
- [ ] Regenerate human and machine documentation from the Effect command/tool definitions.
- [ ] Run cross-runtime golden tests and migration tests against copied real-world state.
- [ ] Implement the milestone-gated cutover and offline restore/replay rollback lifecycle defined above, including immutable backup, migration receipt, store-owner marker, validation, and no shared mutable dual-write period.
- [ ] Stop default Python/uv installation at the no-default-Python gate; remove the generated shim and runtime checks only at the later legacy-retirement gate.

**Exit gate:** a clean installation needs no Python/uv, an existing installation migrates safely, and `hsy` can execute the supported Jarvis protocol natively.

## Verification requirements

- [ ] Specific Effect tests for every new service and pure transformation.
- [ ] Contract tests for backend implementations and transport-independent Notion semantics.
- [ ] Notion MCP discovery/schema-drift tests with recorded schemas and an opt-in live compatibility probe.
- [ ] Golden tests generated from Python fixtures, never live paid APIs.
- [ ] Live opt-in integration profiles for local AnyType and sandbox connector accounts.
- [ ] Fault injection for malformed state, timeouts, retries, partial writes, duplicate webhooks, cancellation, and process restart.
- [ ] `npm run check` after every implementation slice.
- [ ] No Python shim removal until compatibility and rollback tests pass.

## Proposed first implementation slice

- [x] Add the frozen command/state manifest and parity report schema.
- [x] Add Jarvis path/config/context Effect services.
- [x] Port the 12-file context merge and `{{global}}` behavior.
- [x] Add golden fixtures from Python tests.
- [x] Expose a read-only diagnostic command showing resolved config, paths, context, and migration status.

This slice proves compatibility architecture before connector writes or product workflows are ported.
