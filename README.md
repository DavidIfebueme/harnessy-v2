# Harnessy

Harnessy gives an agent a portable project context: capabilities, skills,
memory, connectors, and checks that live with the repo instead of inside one
agent app.

It ships two commands:

| Command | Purpose |
|---------|---------|
| `harnessy` | Deterministic setup, capability management, verification, connectors, engine cockpit (`harnessy web`), and MCP wiring (`harnessy mcp install`). |
| `hsy` | Harnessy agent shell. It launches the Pi runtime with Harnessy identity and its own `~/.hsy/agent` config; the engine's tools (`harnessy_execute` / `harnessy_skills` / `harnessy_resume`) are built into every session. |

Both sit on the Harnessy engine (the vendored Executor at `executor/`), which
owns integrations, connections, credentials, policies, approvals, and audit.
The full surface map — agent tools, CLI, cockpit, MCP endpoint, SDK — is in
[`docs/product-surfaces.md`](docs/product-surfaces.md).

## Install

Current install path is from source:

```bash
git clone https://github.com/Flow-Research/harnessy-v2.git
cd harnessy-v2

npm install --ignore-scripts
npm run build
npm --workspace @harnessy/core link
```

Verify:

```bash
harnessy --help
hsy --help
```

`@harnessy/core` is not published to npm yet.

## Start the Agent

Launch Harnessy's agent shell:

```bash
hsy
```

`hsy` opens a Harnessy-branded Pi runtime. It uses `~/.hsy/agent`, not your
normal `~/.pi/agent` state.

Useful first prompts:

```text
Install Harnessy in this repo and verify it.
```

```text
Inspect this repo's Harnessy capabilities and tell me what is missing.
```

```text
Add the local v1 compatibility capability and materialize it.
```

After installing or changing extensions, reload inside `hsy`:

```text
/reload
```

That refreshes keybindings, extensions, skills, prompts, and themes.

## Quick CLI Flow

Initialize a repo:

```bash
harnessy install --yes --target /path/to/project
harnessy verify --target /path/to/project
```

Preview before writing:

```bash
harnessy install --dry-run --target /path/to/project
```

Add and materialize a capability:

```bash
harnessy capability add ./packages/capability-harnessy-v1-full --target /path/to/project
harnessy capability materialize --target /path/to/project
harnessy capability list --target /path/to/project
```

Check the environment:

```bash
harnessy doctor --target /path/to/project
```

## What Harnessy Manages

| Area | What it means |
|------|---------------|
| Capabilities | Portable packs of context, skills, scripts, connector metadata, dependencies, and checks. |
| Context | Project instructions under `.harnessy/context/`. |
| Memory | Scoped project facts and decisions under `.harnessy/memory/`. |
| Profiles | Load plans for context and memory files. |
| Skills | Project-local skills under `.harnessy/skills/`. |
| Connectors | Local-first integration capabilities, starting with AnyType. |
| Verification | Checks for lockfiles, generated files, capability paths, and dependencies. |

## Project Layout

After setup:

```text
.
├── AGENTS.md
├── .harnessy/
│   ├── harnessy.lock.json
│   ├── context/AGENTS.md
│   ├── profiles/default.json
│   ├── memory/
│   ├── capabilities/
│   └── skills/
└── scripts/harnessy/
```

## Common Commands

```bash
# Project setup
harnessy init
harnessy install --yes
harnessy verify
harnessy doctor

# Capabilities
harnessy capability add <source>
harnessy capability list
harnessy capability inspect <id>
harnessy capability materialize
harnessy deps check

# Skills
harnessy skill create <name>
harnessy skill validate
harnessy skill list
harnessy skill metrics compute <name>

# AnyType connector
harnessy connector anytype spaces
harnessy connector anytype search --space <space-id> --query "roadmap"
harnessy connector anytype get --space <space-id> --object-id <object-id>
```

Most read commands support `--json`.

## Safety

Harnessy is local-first and reviewable:

- use `--dry-run` before writes
- user-global writes require `--apply-global`
- bootstrap external commands require `--apply-bootstrap --run-external`
- connector calls default to local/loopback endpoints
- capability metadata is inspectable before use

Use a sandbox or container for untrusted capabilities.

## Development

```bash
npm install --ignore-scripts
npm run build
npm run check
```

Useful files:

| File | Purpose |
|------|---------|
| `PORT_MAP.md` | v1 to v2 migration map. |
| `HARNESSY_V1_FEATURES.md` | Preserved v1 feature inventory. |
| `HARNESSY_REMAINING_MIGRATION_POINTS.md` | Remaining migration points. |
| `AGENTS.md` | Repo instructions for agent sessions. |

## License

See [LICENSE](LICENSE). The vendored Pi runtime keeps its original MIT notice.
