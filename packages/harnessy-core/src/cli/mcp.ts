import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { Console, Schema } from "effect";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { HarnessError } from "../errors.ts";

/**
 * The engine writes a bearer token to `<data-dir>/server-control/auth.json`
 * when it first starts. Harnessy reads it back here so registering the engine
 * with an agent never requires copying a token out of the cockpit UI — the
 * engine and Harnessy are one product, so Harnessy registers itself.
 */
const EngineAuth = Schema.Struct({ token: Schema.String });

const dataDirFlag = Flag.string("data-dir").pipe(
	Flag.withDescription("Engine data directory (default ~/.harnessy/engine-dev)"),
	Flag.optional,
);

const urlFlag = Flag.string("url").pipe(
	Flag.withDescription("Engine base URL (default http://127.0.0.1:<port>)"),
	Flag.optional,
);

const portFlag = Flag.integer("port").pipe(
	Flag.withDescription("Engine port when --url is not given (default 4788, matching `harnessy web`)"),
	Flag.optional,
);

const agentFlag = Flag.string("agent").pipe(
	Flag.atLeast(0),
	Flag.withDescription("Agent client to register with (repeatable, e.g. claude, cursor); omit to be prompted"),
);

const globalFlag = Flag.boolean("global").pipe(
	Flag.withDefault(false),
	Flag.withDescription("Register at the user level instead of the current project"),
);

const printFlag = Flag.boolean("print").pipe(
	Flag.withDefault(false),
	Flag.withDescription("Print the registration command instead of running it"),
);

const yesFlag = Flag.boolean("yes").pipe(
	Flag.withDefault(false),
	Flag.withDescription("Skip add-mcp's interactive confirmation (needed outside a TTY)"),
);

const shellQuote = (value: string): string =>
	/^[A-Za-z0-9_/:=@%+.,-]+$/.test(value) ? value : `'${value.replace(/'/g, `'"'"'`)}'`;

const readEngineToken = (dataDir: string) =>
	Effect.gen(function* () {
		const authPath = join(dataDir, "server-control", "auth.json");
		if (!existsSync(authPath)) {
			return yield* new HarnessError({
				message: `No engine auth token at ${authPath}. Start the engine once with \`harnessy web\` (it writes the token on boot), then rerun.`,
			});
		}
		const raw = yield* Effect.try({
			try: () => JSON.parse(readFileSync(authPath, "utf8")) as unknown,
			catch: (cause) => new HarnessError({ message: `Could not read ${authPath}: ${String(cause)}` }),
		});
		const auth = yield* Schema.decodeUnknownEffect(EngineAuth)(raw).pipe(
			Effect.mapError(() => new HarnessError({ message: `${authPath} does not contain a { token } object.` })),
		);
		return auth.token;
	});

export const mcpInstallCommand = Command.make(
	"install",
	{
		dataDir: dataDirFlag,
		url: urlFlag,
		port: portFlag,
		agents: agentFlag,
		global: globalFlag,
		print: printFlag,
		yes: yesFlag,
	},
	({ dataDir, url, port, agents, global: userLevel, print, yes }) =>
		Effect.gen(function* () {
			const resolvedDataDir = Option.getOrElse(dataDir, () => join(homedir(), ".harnessy", "engine-dev"));
			const resolvedPort = Option.getOrElse(port, () => 4788);
			const base = Option.getOrElse(url, () => `http://127.0.0.1:${resolvedPort}`);
			const endpoint = `${base.replace(/\/$/, "")}/mcp`;
			const token = yield* readEngineToken(resolvedDataDir);

			const args = [
				"add-mcp",
				endpoint,
				"--transport",
				"http",
				"--name",
				"harnessy",
				"--header",
				`Authorization: Bearer ${token}`,
				...agents.flatMap((agent) => ["--agent", agent]),
				...(userLevel ? ["--global"] : []),
				...(yes ? ["--yes"] : []),
			];

			if (print) {
				yield* Console.log(`npx ${args.map(shellQuote).join(" ")}`);
				return;
			}

			yield* Console.log(`Registering the Harnessy engine (${endpoint}) with your agent...`);
			const exitCode = yield* Effect.callback<number, HarnessError>((resume) => {
				const child = spawn("npx", args, { stdio: "inherit", env: process.env });
				child.once("error", (error) =>
					resume(Effect.fail(new HarnessError({ message: `Failed to run npx add-mcp: ${error.message}` }))),
				);
				child.once("exit", (code) => resume(Effect.succeed(code ?? 0)));
				return Effect.sync(() => {
					child.kill("SIGTERM");
				});
			});
			if (exitCode !== 0) {
				return yield* new HarnessError({ message: `add-mcp exited with code ${exitCode}.` });
			}
			yield* Console.log("Done. Your agent now reaches every tool the engine exposes, as `harnessy`.");
		}),
).pipe(Command.withDescription("Register the local Harnessy engine as an MCP server for your agent"));

/** MCP command group: agents talk to the engine through Harnessy, not around it. */
export const mcpCommand = Command.make("mcp").pipe(
	Command.withSubcommands([mcpInstallCommand] as const),
	Command.withDescription("Connect agents to the Harnessy engine over MCP"),
);
