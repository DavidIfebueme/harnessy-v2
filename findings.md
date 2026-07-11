# Jarvis → Effect Migration Findings

## Source of truth

- Canonical Python source: `/home/kixey/harnessy/jarvis-cli`.
- Preserved v2 snapshot: `harnessy-v1/jarvis-cli`.
- Source trees currently match exactly when caches and bytecode are excluded.
- Python implementation: 137 source files, 35,829 lines, 169 classes, 1,109 functions.
- Tests: 79 test files, 1,173 test functions, 18,824 test lines.

## Actual command surface

- Live Click tree: 131 nodes and 110 leaf commands.
- After removing aliases such as `w`, `j`, `t`, `o`, `rl`, `apk`, `p`, and `n`, the canonical surface is approximately 89 commands.
- `jarvis docs --json` is stale. It reports 22 top-level entries and omits implemented groups including wiki, object, calendar planning, and notes.
- Migration contracts must be generated from the executable Click tree and tests, not the existing docs JSON.

## Core contracts

- `KnowledgeBaseAdapter`: 23 methods covering capabilities, lifecycle, spaces, tasks, journal, tags, and generic objects.
- `SyncAdapter`: 6 write/delete methods.
- `WikiBackend`: 14 AI/research methods.
- `CalendarProvider`: 3 methods.
- Backend failures use a nine-class hierarchy.
- Configuration has AnyType, Notion, content, analytics, Fathom, and WhatsApp models under one root settings model.

## Current native Effect overlap

- Harnessy core has capability/install/profile/skill infrastructure.
- AnyType connector exposes only three read methods: list spaces, search, and get object.
- AI runner currently ports provider/model resolution and failure classification, not provider execution or Jarvis workflows.
- Context and memory templates exist but do not implement Jarvis's 12-file two-tier merge or `{{global}}` behavior.
- No native task, scheduler, journal, plan, note, reading list, content, sync, wiki, meeting, Fathom, WhatsApp, Notion, or Android domain implementation exists.
- Bootstrap still installs or generates a shim for the Python Jarvis CLI.

## State compatibility

Existing formats include:

- `~/.jarvis/config.yaml`, `config.json`, and `pending.json`.
- `~/.jarvis/journal/`, `plans/`, `sync/`, `cache/reading-list/`, `wikis/`, `state/fathom/`, and `env/fathom.zsh`.
- Project `.jarvis/context/` plus private notes, content, meeting inboxes, and WhatsApp threads.
- Config/environment surface includes at least 28 named environment variables.

The port needs versioned decoding, atomic writes, migration backups, and concurrency protection for webhook/agent writers.

## Notion transport update

- Notion's recommended interactive integration is its hosted MCP endpoint at `https://mcp.notion.com/mcp` over Streamable HTTP.
- Hosted access uses OAuth 2.0 + PKCE and requires refresh, secure credential storage, expiry handling, and eventual reauthorization.
- Hosted MCP supports search/fetch, page and database creation/update, comments, Markdown editing, and asynchronous large writes.
- MCP schemas are not a stable domain contract; identifier and input shapes can change, including database operations moving toward `data_source_id`.
- Notion's local bearer-token MCP is useful for headless experiments but is not the primary supported path and may be retired.
- Harnessy must not expose raw MCP tools directly to the agent. Hosted MCP and direct Effect HTTP should normalize behind one semantic connector contract with policy, idempotency, audit metadata, capability discovery, and typed failures.
- Direct Effect HTTP remains necessary for headless/service operation, unsupported MCP operations, deterministic recovery, and compatibility fallback.

## Deferred authorization decision

The Plannotator review approved deferring approval UX, scoped grants, mutation auditing, and operator-versus-agent write boundaries to a GitHub issue. That issue must be created as the first execution task. Write-capable operations remain disabled until the issue is resolved and implemented.

## Port versus retirement

Port domain behavior, schemas, compatibility formats, and deterministic transformations. Retire or extract:

- Deprecated `AnyTypeClient`.
- Duplicate root `models.py`.
- Click/Rich presentation internals.
- Python singleton adapter registry.
- Direct Anthropic-only execution.
- Android/tmux/cloudflared/Obsidian launch behavior from core; expose these as optional capabilities.
