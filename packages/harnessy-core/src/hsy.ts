#!/usr/bin/env node
import process from "node:process";
import { runPiCli } from "@earendil-works/pi-coding-agent";
import { harnessyWelcomeExtension } from "./hsy-welcome-extension.ts";

const PACKAGE_COMMANDS = new Set(["config", "install", "list", "remove", "uninstall", "update"]);
const COMMANDS_WITH_HELP = new Set([...PACKAGE_COMMANDS, "launch"]);

function normalizeHsyArgs(args: string[]): string[] {
	const [first, second, ...rest] = args;
	if (first === undefined) return args;
	if (first === "launch") return args.slice(1);
	if (first === "--help" || first === "-h" || first === "--version" || first === "-v") return args;
	if (PACKAGE_COMMANDS.has(first)) return args;
	if (first !== "help") return args;
	if (second === undefined || second === "launch") return ["--help"];
	if (COMMANDS_WITH_HELP.has(second)) return [second, "--help", ...rest];
	return ["--help"];
}

void runPiCli(normalizeHsyArgs(process.argv.slice(2)), {
	appIdentity: {
		name: "hsy",
		title: "Harnessy",
		description: "Harnessy agent-first context engine",
		configDir: ".hsy",
	},
	extensionFactories: [{ name: "harnessy-welcome", factory: harnessyWelcomeExtension }],
});
