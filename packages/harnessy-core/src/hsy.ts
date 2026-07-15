#!/usr/bin/env node
import process from "node:process";
import { runPiCli } from "@earendil-works/pi-coding-agent";
import {
	configureHsyRuntimeEnv,
	HSY_APP_DESCRIPTION,
	HSY_APP_NAME,
	HSY_APP_TITLE,
	HSY_CONFIG_DIR,
} from "./hsy-runtime-env.ts";
import { harnessyWelcomeExtension } from "./hsy-welcome-extension.ts";

const PACKAGE_COMMANDS = new Set(["config", "install", "list", "remove", "uninstall", "update"]);
// Words routed to the harnessy CLI instead of the agent: these name product
// surfaces (servers, engine wiring), never prompts.
const CLI_COMMANDS = new Set(["web", "mcp"]);
const COMMANDS_WITH_HELP = new Set([...PACKAGE_COMMANDS, ...CLI_COMMANDS, "launch"]);

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

const args = normalizeHsyArgs(process.argv.slice(2));
const head = args[0] === "--web" ? "web" : args[0];

if (head !== undefined && CLI_COMMANDS.has(head)) {
	// `hsy web` starts the cockpit and `hsy mcp ...` wires agents to the
	// engine — neither must ever fall through to the agent as a prompt.
	// Route in-process to the harnessy CLI (same package, reads argv).
	process.argv = [process.argv[0], process.argv[1], head, ...args.slice(1)];
	await import("./main.ts");
} else {
	configureHsyRuntimeEnv();

	void runPiCli(args, {
		appIdentity: {
			name: HSY_APP_NAME,
			title: HSY_APP_TITLE,
			description: HSY_APP_DESCRIPTION,
			configDir: HSY_CONFIG_DIR,
		},
		extensionFactories: [{ name: "harnessy-welcome", factory: harnessyWelcomeExtension }],
	});
}
