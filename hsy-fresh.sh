#!/usr/bin/env bash
# Launch the Harnessy agent as a brand-new user would see it.
#
# HOME is pointed at a throwaway sandbox, so nothing personal leaks in:
# no ~/.pi settings/extensions/packages, no ~/.agents skills, no ~/.harnessy
# engine data, no provider auth.json. Provider API keys from the environment
# still apply (a fresh user would export those too); add --no-env semantics
# by unsetting them yourself if you want a fully keyless run.
#
# The engine sandbox is scoped the same way: the builtin harnessy_* tools
# look for the engine at $HOME/.harnessy/engine-dev inside the sandbox. To
# test the full product loop, start a matching cockpit in another terminal
# with the command this script prints.
#
# Re-enter the same sandbox later: HSY_FRESH_DIR=<printed dir> ./hsy-fresh.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FRESH_DIR="${HSY_FRESH_DIR:-$(mktemp -d -t hsy-fresh-XXXXXX)}"
mkdir -p "$FRESH_DIR/project"

echo "Fresh Harnessy sandbox: $FRESH_DIR"
echo "Engine cockpit for this sandbox (separate terminal):"
echo "  node $SCRIPT_DIR/packages/harnessy-core/dist/cli.js web --data-dir \"$FRESH_DIR/.harnessy/engine-dev\""
echo

cd "$FRESH_DIR/project"
HOME="$FRESH_DIR" \
	HARNESSY_ENGINE_DATA_DIR="$FRESH_DIR/.harnessy/engine-dev" \
	exec "$SCRIPT_DIR/node_modules/.bin/tsx" --tsconfig "$SCRIPT_DIR/tsconfig.json" \
	"$SCRIPT_DIR/packages/coding-agent/src/cli.ts" "$@"
