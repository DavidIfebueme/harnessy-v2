import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { Console } from "effect";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { HarnessError } from "../errors.ts";

/**
 * The cockpit is the vendored engine's local web app (`executor/apps/local`),
 * run with upstream's own tooling (bun + vite) from its self-hosted vendor
 * world. Walk upward from cwd so the command works from anywhere inside the
 * repo; there is no installed-package story for the cockpit yet — it is a
 * dev/test surface, and the error says so when the tree is not present.
 */
const findCockpitDir = (startDir: string): string | undefined => {
	let current = startDir;
	for (;;) {
		const candidate = join(current, "executor", "apps", "local");
		if (existsSync(join(candidate, "vite.config.ts"))) return candidate;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
};

const portFlag = Flag.integer("port").pipe(
	Flag.withDescription("Port for the cockpit dev server (default 4788)"),
	Flag.optional,
);

const dataDirFlag = Flag.string("data-dir").pipe(
	Flag.withDescription("Engine data directory (default ~/.harnessy/engine-dev)"),
	Flag.optional,
);

export const webCommand = Command.make("web", { port: portFlag, dataDir: dataDirFlag }, ({ port, dataDir }) =>
	Effect.gen(function* () {
		const cockpitDir = findCockpitDir(process.cwd());
		if (cockpitDir === undefined) {
			return yield* new HarnessError({
				message:
					"Could not find the engine cockpit (executor/apps/local) above the current directory. Run this inside the harnessy repo.",
			});
		}
		const resolvedPort = Option.getOrElse(port, () => 4788);
		const resolvedDataDir = Option.getOrElse(dataDir, () => join(homedir(), ".harnessy", "engine-dev"));
		yield* Console.log(`Starting the Harnessy cockpit from ${cockpitDir}`);
		yield* Console.log(`Engine data: ${resolvedDataDir}`);

		const exitCode = yield* Effect.callback<number, HarnessError>((resume) => {
			const child = spawn("bunx", ["--bun", "vite", "dev"], {
				cwd: cockpitDir,
				stdio: "inherit",
				env: {
					...process.env,
					EXECUTOR_DATA_DIR: resolvedDataDir,
					PORT: String(resolvedPort),
				},
			});
			child.once("error", (error) =>
				resume(
					Effect.fail(
						new HarnessError({
							message: `Failed to start the cockpit (is bun installed?): ${error.message}`,
						}),
					),
				),
			);
			child.once("exit", (code) => resume(Effect.succeed(code ?? 0)));
			return Effect.sync(() => {
				child.kill("SIGTERM");
			});
		});
		if (exitCode !== 0) {
			return yield* new HarnessError({ message: `Cockpit exited with code ${exitCode}.` });
		}
	}),
).pipe(Command.withDescription("Run the local engine cockpit (web UI) for testing"));
