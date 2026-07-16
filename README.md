# Harnessy

**Harnessy gives an agent a portable project context — and a governed engine
for everything it connects to.**

Capabilities, skills, memory, connectors, and checks live with the repo instead
of inside one agent app. Every integration call goes through the Harnessy
engine, which owns credentials, policies, approvals, and audit.

```text
you ──> hsy        (agent)   ──┐
you ──> harnessy   (CLI)     ──┼──> Harnessy engine ──> your integrations
you ──> cockpit    (web UI)  ──┘    credentials · policies · approvals · audit
other agents ──> MCP endpoint ─┘    (OAuth, API keys, OpenAPI, MCP servers)
```

| Surface | Command | What it is for |
|---------|---------|----------------|
| **Agent** | `hsy` | Talk to a model that already has the engine's tools built in |
| **CLI** | `harnessy` | Setup, capabilities, verification, connectors, engine ops |
| **Cockpit** | `harnessy web` | Connect integrations, approve runs, inspect audit |
| **MCP** | `harnessy mcp install` | Give external agents (Claude Code, Cursor, ...) the same engine |

The full surface map lives in [`docs/product-surfaces.md`](docs/product-surfaces.md).

---

## Getting started

### 1. Install

From source (not yet published to npm):

```bash
git clone https://github.com/Flow-Research/harnessy-v2.git
cd harnessy-v2

npm install --ignore-scripts
npm run build
npm --workspace @harnessy/core link
```

Verify both binaries landed:

```bash
harnessy --help
hsy --help
```

### 2. Sign in to a model provider

`hsy` is the agent shell — it needs a model. Either export an API key before
launching:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY, GEMINI_API_KEY, ...
hsy
```

or launch and sign in with a subscription (Claude Pro/Max, ChatGPT Plus/Pro,
GitHub Copilot):

```text
hsy
/login    # pick a provider, follow the OAuth flow
/model    # pick a model (Ctrl+L)
```

Auth and settings live in `~/.hsy/agent` — your existing `~/.pi/agent` state is
never touched.

### 3. Start the engine cockpit

The engine is what holds your integrations. Start it once:

```bash
harnessy web
```

It prints a one-time authenticated URL (`http://127.0.0.1:4788/?_token=...`) —
open it. The engine keeps its state (integrations, connections, runs, policies,
bearer token) in `~/.harnessy/engine-dev`; use `--port` / `--data-dir` to
relocate it.

### 4. Connect your first integration

In the cockpit, add an integration from any of three sources:

- **Preset registry** — thousands of ready-made API definitions; search, pick, done.
- **OpenAPI spec** — paste or upload a spec for any HTTP API.
- **MCP servers** — point the engine at an existing MCP server and its tools
  join the catalog.

Then create a **connection** for it: run the OAuth flow or paste an API key.
The engine stores the credential and injects it at call time — it never passes
through the model or your prompts.

### 5. Use it from the agent

Open `hsy` and just ask — the engine's tools are compiled into every session,
nothing to register:

```text
What integrations are connected?
Search my AnyType notes for the Q3 roadmap.
```

Under the hood the agent uses three built-in tools, and one command:

| Tool | Purpose |
|------|---------|
| `harnessy_execute` | Run code against the connected tool catalog (through policy, credentials, audit) |
| `harnessy_skills` | Fetch the engine's own how-to guide |
| `harnessy_resume` | Approve, decline, or cancel a run paused for approval |
| `/harnessy` | Engine status: token, reachability, usage |

If the engine is down, the tools say so and tell you to run `harnessy web`.

### 6. Wire the engine into other agents (optional)

The same engine can serve Claude Code, Cursor, OpenCode, or anything that
speaks MCP:

```bash
harnessy mcp install                  # register with the default agent
harnessy mcp install --agent cursor   # or pick one; repeatable
harnessy mcp install --print          # show the command instead of running it
```

It reads the engine's bearer token itself — no copying secrets around.

### 7. Try the AnyType connector (optional)

Harnessy ships a local-first [AnyType](https://anytype.io) connector. In the
AnyType desktop app: **Settings → API keys → create a key**, then:

```bash
harnessy connector anytype discover                  # readiness evidence: key, reachability, capabilities
harnessy connector anytype spaces
harnessy connector anytype search --space <space-id> --query "roadmap"
```

To use it from the cockpit/agent instead, open **AnyType → Add account** in the
cockpit and paste the same key. Keys are only ever sent to loopback unless you
pass `--allow-remote`.

---

## Set up a project

Give a repo a portable context:

```bash
harnessy install --yes --target /path/to/project
harnessy verify  --target /path/to/project
```

Preview before writing anything with `--dry-run`. Then add capabilities:

```bash
harnessy capability add ./packages/capability-harnessy-v1-full
harnessy capability materialize
harnessy capability list
```

Useful first prompts inside `hsy`:

```text
Install Harnessy in this repo and verify it.
Inspect this repo's Harnessy capabilities and tell me what is missing.
```

After installing or changing extensions, run `/reload` inside `hsy`.

### What Harnessy manages

| Area | What it means |
|------|---------------|
| Capabilities | Portable packs of context, skills, scripts, connector metadata, dependencies, and checks |
| Context | Project instructions under `.harnessy/context/` |
| Memory | Scoped project facts and decisions under `.harnessy/memory/` |
| Profiles | Load plans for context and memory files |
| Skills | Project-local skills under `.harnessy/skills/` |
| Connectors | Local-first integration capabilities, starting with AnyType |
| Verification | Checks for lockfiles, generated files, capability paths, and dependencies |

### Project layout

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

---

## Command reference

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

# Engine
harnessy web [--port] [--data-dir]
harnessy mcp install [--agent <a>] [--global] [--yes] [--print]

# AnyType connector
harnessy connector anytype discover
harnessy connector anytype spaces
harnessy connector anytype search --space <space-id> --query "roadmap"
harnessy connector anytype get --space <space-id> --object-id <object-id>
```

Most read commands support `--json`. `harnessy --help` lists everything.

## Safety

Harnessy is local-first and reviewable:

- use `--dry-run` before writes
- user-global writes require `--apply-global`
- bootstrap external commands require `--apply-bootstrap --run-external`
- connector calls default to local/loopback endpoints
- integration credentials live in the engine and are injected at call time,
  never exposed to the model
- capability metadata is inspectable before use

Use a sandbox or container for untrusted capabilities.

## Development

```bash
npm install --ignore-scripts
npm run build
npm run check
```

Try the product as a brand-new user — throwaway HOME, no personal config,
out-of-the-box package set:

```bash
npm run hsy:fresh
```

| File | Purpose |
|------|---------|
| [`docs/product-surfaces.md`](docs/product-surfaces.md) | Full surface map: agent tools, CLI, cockpit, MCP, SDK |
| `PORT_MAP.md` | v1 to v2 migration map |
| `HARNESSY_V1_FEATURES.md` | Preserved v1 feature inventory |
| `AGENTS.md` | Repo instructions for agent sessions |

## License

See [LICENSE](LICENSE). The vendored Pi runtime and Executor engine keep their
original MIT notices.
