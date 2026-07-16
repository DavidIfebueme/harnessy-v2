import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

import { Console, Schema } from "effect";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { ANYTYPE_DEFAULT_BASE_URL, ANYTYPE_DEFAULT_VERSION } from "../connectors/anytype.ts";
import { HarnessError } from "../errors.ts";
import { runExecutorBuiltin } from "../executor-builtin.ts";

const DEFAULT_COCKPIT_PORT = 4788;
const COCKPIT_READY_TIMEOUT_MS = 30_000;
const ANYTYPE_SLUG = "anytype";
const ANYTYPE_SPEC_URL = new URL("../../resources/anytype.openapi.json", import.meta.url);

type WebFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RegisterBundledAnytypeOptions {
	readonly cockpitUrl: string;
	readonly dataDir: string;
	readonly fetchImpl?: WebFetch;
	readonly readyTimeoutMillis?: number;
	readonly signal?: AbortSignal;
}

export type BundledAnytypeRegistration = "registered" | "already-registered";

const responseError = async (action: string, response: Response): Promise<Error> => {
	const detail = (await response.text()).trim().slice(0, 500);
	return new Error(`${action} failed with HTTP ${response.status}${detail === "" ? "" : `: ${detail}`}`);
};

/** Wait for the cockpit API and idempotently install Harnessy's bundled AnyType card. */
export async function registerBundledAnytype({
	cockpitUrl,
	dataDir,
	fetchImpl = globalThis.fetch,
	readyTimeoutMillis = COCKPIT_READY_TIMEOUT_MS,
	signal,
}: RegisterBundledAnytypeOptions): Promise<BundledAnytypeRegistration> {
	const baseUrl = cockpitUrl.replace(/\/$/, "");
	const deadline = Date.now() + readyTimeoutMillis;
	for (;;) {
		if (signal?.aborted) throw signal.reason;
		const response = await fetchImpl(`${baseUrl}/api/health`, { signal }).then(
			(value) => value,
			(error: unknown) => (signal?.aborted ? Promise.reject(error) : undefined),
		);
		if (response !== undefined) {
			await response.body?.cancel();
			if (response.ok) break;
		}
		if (Date.now() >= deadline) {
			throw new Error(`Cockpit API did not become ready at ${baseUrl} within ${readyTimeoutMillis}ms.`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	const authPath = join(dataDir, "server-control", "auth.json");
	const auth = JSON.parse(readFileSync(authPath, "utf8")) as { token?: unknown };
	if (typeof auth.token !== "string" || auth.token === "") {
		throw new Error(`${authPath} does not contain a { token } object.`);
	}
	const headers = { Authorization: `Bearer ${auth.token}` };
	const existing = await fetchImpl(`${baseUrl}/api/openapi/integrations/${ANYTYPE_SLUG}`, { headers, signal });
	if (!existing.ok) throw await responseError("Checking the bundled AnyType integration", existing);
	if ((await existing.json()) !== null) return "already-registered";

	const added = await fetchImpl(`${baseUrl}/api/openapi/specs`, {
		method: "POST",
		headers: { ...headers, "content-type": "application/json" },
		body: JSON.stringify({
			spec: { kind: "blob", value: readFileSync(ANYTYPE_SPEC_URL, "utf8") },
			slug: ANYTYPE_SLUG,
			name: "AnyType",
			description: "Local-first AnyType knowledge through Harnessy.",
			baseUrl: ANYTYPE_DEFAULT_BASE_URL,
			headers: { "Anytype-Version": ANYTYPE_DEFAULT_VERSION },
			healthCheck: { operation: "spaces_list" },
		}),
		signal,
	});
	if (added.status === 409) {
		await added.body?.cancel();
		return "already-registered";
	}
	if (!added.ok) throw await responseError("Registering the bundled AnyType integration", added);
	await added.body?.cancel();
	return "registered";
}

const portFlag = Flag.integer("port").pipe(
	Flag.withDescription("Preferred port for the packaged cockpit service (default 4788)"),
	Flag.optional,
);

const dataDirFlag = Flag.string("data-dir").pipe(
	Flag.withDescription("Executor data directory (default ~/.executor)"),
	Flag.optional,
);

const scopeFlag = Flag.string("scope").pipe(
	Flag.withDescription("Executor workspace scope (default: current directory)"),
	Flag.optional,
);

const EngineServerManifest = Schema.Struct({
	connection: Schema.Struct({ origin: Schema.String }),
});

const readEngineOrigin = (dataDir: string) =>
	Effect.try({
		try: () => {
			const manifestPath = join(dataDir, "server-control", "server.json");
			const manifest = Schema.decodeUnknownSync(EngineServerManifest)(
				JSON.parse(readFileSync(manifestPath, "utf8")) as unknown,
			);
			return manifest.connection.origin;
		},
		catch: (cause) =>
			new HarnessError({
				message: `The packaged Executor daemon started without a readable server manifest: ${String(cause)}`,
			}),
	});

export const webCommand = Command.make(
	"web",
	{ port: portFlag, dataDir: dataDirFlag, scope: scopeFlag },
	({ port, dataDir, scope }) =>
		Effect.gen(function* () {
			const resolvedPort = Option.getOrElse(port, () => DEFAULT_COCKPIT_PORT);
			const executorDataDir = resolve(
				Option.getOrElse(dataDir, () => process.env.EXECUTOR_DATA_DIR?.trim() || join(homedir(), ".executor")),
			);
			const executorEnv: NodeJS.ProcessEnv = {
				...process.env,
				...(Option.isSome(dataDir) ? { EXECUTOR_DATA_DIR: executorDataDir } : {}),
			};
			yield* Console.log(`Executor data: ${executorDataDir}`);
			const daemonExitCode = yield* runExecutorBuiltin({
				args: [
					"daemon",
					"run",
					"--port",
					String(resolvedPort),
					"--hostname",
					"127.0.0.1",
					...(Option.isSome(scope) ? ["--scope", scope.value] : []),
				],
				env: executorEnv,
			});
			if (daemonExitCode !== 0) {
				return yield* new HarnessError({ message: `Executor daemon exited with code ${daemonExitCode}.` });
			}

			const cockpitUrl = yield* readEngineOrigin(executorDataDir);
			yield* Effect.tryPromise({
				try: () =>
					registerBundledAnytype({
						cockpitUrl,
						dataDir: executorDataDir,
					}),
				catch: (cause) =>
					new HarnessError({
						message: `Failed to register the bundled AnyType integration: ${String(cause)}`,
					}),
			});

			const webExitCode = yield* runExecutorBuiltin({ args: ["web"], env: executorEnv });
			if (webExitCode !== 0) {
				return yield* new HarnessError({ message: `Executor web command exited with code ${webExitCode}.` });
			}
		}),
).pipe(Command.withDescription("Start or attach the packaged engine daemon and open its cockpit"));
