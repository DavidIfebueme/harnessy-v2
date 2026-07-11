#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		commands: { type: "string", default: "packages/harnessy-core/fixtures/jarvis-v1/command-manifest.json" },
		state: { type: "string", default: "packages/harnessy-core/fixtures/jarvis-v1/state-manifest.json" },
		output: { type: "string", default: "packages/harnessy-core/fixtures/jarvis-v1/parity-manifest.json" },
	},
});

const commandManifest = JSON.parse(await readFile(resolve(values.commands), "utf8"));
const stateManifest = JSON.parse(await readFile(resolve(values.state), "utf8"));

const retiredCommand = (command) => {
	const reference = command.path.join(" ");
	const shorthand = command.path[1];
	if (["j", "t", "o", "rl", "p", "n"].includes(shorthand) || shorthand === "w") {
		return {
			replacement:
				shorthand === "w"
					? ["jarvis", "wiki", ...command.path.slice(2)].join(" ")
					: "Canonical hsy domain tool, slash command, skill, or CLI surface",
			rationale: "Aliases are compatibility conveniences, not independent native protocol nodes.",
		};
	}
	if (shorthand === "android" || shorthand === "apk") {
		return {
			replacement: "Optional Android host capability",
			rationale: "Android SDK requirements do not belong in the portable core.",
		};
	}
	if (reference === "jarvis docs") {
		return {
			replacement: "Generated hsy CLI, tool-schema, slash-command, and skill documentation",
			rationale: "Documentation is generated from native definitions rather than maintained as a legacy command registry.",
		};
	}
	if (reference === "jarvis wiki open") {
		return {
			replacement: "Optional Obsidian desktop capability",
			rationale: "Core preserves URL generation without depending on a desktop application.",
		};
	}
	if (
		[
			"jarvis meeting fathom start",
			"jarvis meeting fathom webhook serve",
			"jarvis whatsapp webhook serve",
		].includes(reference)
	) {
		return {
			replacement: "Separate Effect channel daemon plus optional hsy daemon supervision",
			rationale: "Persistent receivers do not run inside the interactive agent process.",
		};
	}
};

const commandEntries = commandManifest.commands.map((command) => {
	const reference = command.path.join(" ");
	const retirement = retiredCommand(command);
	return {
		id: `command:${command.path.join(":")}`,
		surface: "command",
		legacyReference: reference,
		status: retirement === undefined ? (reference === "jarvis" ? "partial" : "missing") : "intentionally-retired",
		...(retirement ??
			(reference === "jarvis"
				? { replacement: "hsy jarvis", rationale: "The native compatibility command group is available." }
				: {})),
	};
});

const stateEntries = stateManifest.stores.map((store) => {
	const status = store.id === "project-context-v1" ? "compatible" : store.id === "legacy-config-yaml-v1" ? "partial" : "missing";
	return {
		id: `state:${store.id}`,
		surface: "state",
		legacyReference: store.id,
		status,
		...(status === "compatible"
			? { replacement: "JarvisContextLoader", rationale: "The native loader reproduces the twelve-file legacy merge contract." }
			: status === "partial"
				? { replacement: "JarvisConfigReader", rationale: "YAML decoding is native; full environment resolution remains." }
				: {}),
	};
});

const contextFiles = [
	"preferences.md",
	"patterns.md",
	"constraints.md",
	"priorities.md",
	"goals.md",
	"projects.md",
	"recurring.md",
	"focus.md",
	"blockers.md",
	"calendar.md",
	"delegation.md",
	"decisions.md",
];

const contextEntries = contextFiles.map((file) => ({
	id: `context:${file}`,
	surface: "context",
	legacyReference: file,
	status: "compatible",
	replacement: "JarvisContextLoader",
	rationale: "Global/project precedence and {{global}} expansion are covered by native compatibility tests.",
}));

const plannedEntries = [
	["connector:anytype", "connector", "AnyTypeAdapter", "partial", "Focused Effect knowledge services", "Existing native reads cover list spaces, search, and get object."],
	["connector:notion", "connector", "NotionAdapter", "missing"],
	["workflow:tasks-planning", "workflow", "task/analyzer/plan", "missing"],
	["workflow:journal-notes", "workflow", "journal/note", "missing"],
	["workflow:reading-content-sync", "workflow", "reading_list/content/sync", "missing"],
	["workflow:wiki", "workflow", "wiki", "missing"],
	["channel:meetings", "channel", "meetings", "missing"],
	["channel:fathom", "channel", "meetings/fathom", "missing"],
	["channel:whatsapp", "channel", "whatsapp", "missing"],
	["host-capability:android", "host-capability", "android/apk", "intentionally-retired", "Optional Android host capability", "Android SDK requirements do not belong in the portable core."],
	["host-capability:tmux", "host-capability", "tmux process management", "intentionally-retired", "Optional process-supervision capability", "Interactive hsy does not own persistent process supervision."],
	["host-capability:cloudflared", "host-capability", "cloudflared tunnel launch", "intentionally-retired", "Optional tunnel capability", "Tunnel lifecycle is separate from channel domain services."],
	["host-capability:shell-profile", "host-capability", "shell profile mutation", "intentionally-retired", "Optional shell integration capability", "Core services must not mutate shell startup files."],
	["host-capability:obsidian-open", "host-capability", "Obsidian launching", "intentionally-retired", "Optional desktop integration capability", "Core preserves URL generation without depending on a desktop application."],
].map(([id, surface, legacyReference, status, replacement, rationale]) => ({
	id,
	surface,
	legacyReference,
	status,
	...(replacement === undefined ? {} : { replacement }),
	...(rationale === undefined ? {} : { rationale }),
}));

const entries = [...commandEntries, ...stateEntries, ...contextEntries, ...plannedEntries].sort((left, right) => left.id.localeCompare(right.id));
const manifest = { schemaVersion: 1, sourceVersion: commandManifest.source.version, entries };
await writeFile(resolve(values.output), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
