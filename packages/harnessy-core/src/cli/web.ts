import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { Console } from "effect";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { ANYTYPE_DEFAULT_BASE_URL, ANYTYPE_DEFAULT_VERSION } from "../connectors/anytype.ts";
import { HarnessError } from "../errors.ts";

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
		const resolvedPort = Option.getOrElse(port, () => DEFAULT_COCKPIT_PORT);
		const resolvedDataDir = Option.getOrElse(dataDir, () => join(homedir(), ".harnessy", "engine-dev"));
		const cockpitUrl = `http://127.0.0.1:${resolvedPort}`;
		yield* Console.log(`Starting the Harnessy cockpit from ${cockpitDir}`);
		yield* Console.log(`Engine data: ${resolvedDataDir}`);

		const exitCode = yield* Effect.callback<number, HarnessError>((resume) => {
			let registrationComplete = false;
			let settled = false;
			const abortController = new AbortController();
			const finish = (effect: Effect.Effect<number, HarnessError>) => {
				if (settled) return;
				settled = true;
				resume(effect);
			};
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
				finish(
					Effect.fail(
						new HarnessError({
							message: `Failed to start the cockpit (is bun installed?): ${error.message}`,
						}),
					),
				),
			);
			child.once("exit", (code) => {
				if (!registrationComplete) {
					finish(
						Effect.fail(
							new HarnessError({
								message: `Cockpit exited with code ${code ?? 0} before the bundled AnyType integration was registered.`,
							}),
						),
					);
					return;
				}
				finish(Effect.succeed(code ?? 0));
			});
			void registerBundledAnytype({
				cockpitUrl,
				dataDir: resolvedDataDir,
				signal: abortController.signal,
			}).then(
				() => {
					registrationComplete = true;
				},
				(error: unknown) => {
					finish(
						Effect.fail(
							new HarnessError({
								message: `Failed to register the bundled AnyType integration: ${error instanceof Error ? error.message : String(error)}`,
							}),
						),
					);
					child.kill("SIGTERM");
				},
			);
			return Effect.sync(() => {
				abortController.abort();
				child.kill("SIGTERM");
			});
		});
		if (exitCode !== 0) {
			return yield* new HarnessError({ message: `Cockpit exited with code ${exitCode}.` });
		}
	}),
).pipe(Command.withDescription("Run the local engine cockpit (web UI) for testing"));
