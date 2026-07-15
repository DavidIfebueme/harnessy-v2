/**
 * Built-in Harnessy engine bridge.
 *
 * The Harnessy engine (the vendored Executor) exposes its entire connected
 * tool catalog — integrations, connections, policies, approvals, audit —
 * through one small MCP surface: `execute`, `skills`, and `resume`. This
 * builtin hardwires that surface into every session as `harnessy_*` tools.
 * The engine and this agent are one product, so no MCP registration or
 * token copying is required: the bearer token is read from the engine's own
 * data directory at call time.
 *
 * The engine is contacted lazily. When it is not running (or has never been
 * started), the tools stay registered and fail with instructions to run
 * `harnessy web` — readiness is evidence reported to the model, not a
 * startup error.
 *
 * Environment overrides:
 * - `HARNESSY_ENGINE_URL`      engine base URL (default http://127.0.0.1:4788)
 * - `HARNESSY_ENGINE_DATA_DIR` engine data dir (default ~/.harnessy/engine-dev)
 * - `HARNESSY_ENGINE=0`        disable the builtin entirely
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Type } from "typebox";
import { VERSION } from "../../../config.ts";
import type { ExtensionAPI } from "../types.ts";

const DEFAULT_ENGINE_PORT = 4788;
/** Engine `execute` runs may do real work (API calls, pauses); give them room. */
const CALL_TIMEOUT_MS = 600_000;

function engineBaseUrl(): string {
	const fromEnv = process.env.HARNESSY_ENGINE_URL?.trim();
	return (fromEnv || `http://127.0.0.1:${DEFAULT_ENGINE_PORT}`).replace(/\/$/, "");
}

function engineDataDir(): string {
	return process.env.HARNESSY_ENGINE_DATA_DIR?.trim() || join(homedir(), ".harnessy", "engine-dev");
}

function readEngineToken(): string {
	const authPath = join(engineDataDir(), "server-control", "auth.json");
	if (!existsSync(authPath)) {
		throw new Error(
			`Harnessy engine auth token not found at ${authPath}. Start the engine once with \`harnessy web\` (it writes the token on boot), then retry.`,
		);
	}
	const parsed = JSON.parse(readFileSync(authPath, "utf-8")) as { token?: unknown };
	if (typeof parsed.token !== "string" || parsed.token === "") {
		throw new Error(`${authPath} does not contain a { token } object; re-start the engine with \`harnessy web\`.`);
	}
	return parsed.token;
}

let clientPromise: Promise<Client> | null = null;

async function connectClient(): Promise<Client> {
	const token = readEngineToken();
	// elicitation_mode=model keeps approvals in-band: paused executions return
	// an executionId the model resumes with harnessy_resume.
	const endpoint = new URL(`${engineBaseUrl()}/mcp?elicitation_mode=model`);
	const transport = new StreamableHTTPClientTransport(endpoint, {
		requestInit: { headers: { Authorization: `Bearer ${token}` } },
	});
	const client = new Client({ name: "harnessy-agent", version: VERSION }, { capabilities: {} });
	try {
		await client.connect(transport);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Harnessy engine is not reachable at ${engineBaseUrl()} (${message}). Start it with \`harnessy web\`, then retry.`,
		);
	}
	return client;
}

async function callEngine(
	tool: string,
	args: Record<string, unknown>,
	signal: AbortSignal | undefined,
): Promise<{ content: (TextContent | ImageContent)[] }> {
	// Lazy shared session; a dead connection is dropped and retried once so a
	// restarted engine does not require restarting the agent.
	const attempt = async (): Promise<Awaited<ReturnType<Client["callTool"]>>> => {
		clientPromise ??= connectClient().catch((error: unknown) => {
			clientPromise = null;
			throw error;
		});
		const client = await clientPromise;
		return client.callTool({ name: tool, arguments: args }, undefined, {
			signal,
			timeout: CALL_TIMEOUT_MS,
			resetTimeoutOnProgress: true,
		});
	};

	let result: Awaited<ReturnType<Client["callTool"]>>;
	try {
		result = await attempt();
	} catch (error) {
		if (signal?.aborted) throw error;
		clientPromise = null;
		result = await attempt();
	}

	const content: (TextContent | ImageContent)[] = [];
	for (const item of (result.content ?? []) as Array<Record<string, unknown>>) {
		if (item.type === "text" && typeof item.text === "string") {
			content.push({ type: "text", text: item.text });
		} else if (item.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string") {
			content.push({ type: "image", data: item.data, mimeType: item.mimeType });
		}
	}
	if (content.length === 0) {
		content.push({ type: "text", text: "(the engine returned no textual content)" });
	}
	if (result.isError) {
		throw new Error(content.map((item) => (item.type === "text" ? item.text : "[image]")).join("\n"));
	}
	return { content };
}

async function engineStatus(): Promise<{ ok: boolean; text: string }> {
	const lines: string[] = [];
	let ok = true;
	try {
		readEngineToken();
		lines.push(`token       present (${join(engineDataDir(), "server-control", "auth.json")})`);
	} catch (error) {
		ok = false;
		lines.push(`token       ${error instanceof Error ? error.message : String(error)}`);
	}
	if (ok) {
		try {
			await callEngine("skills", {}, undefined);
			lines.push(`engine      reachable at ${engineBaseUrl()}`);
		} catch (error) {
			ok = false;
			lines.push(`engine      ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	lines.push("");
	lines.push(ok ? "The engine tools are live in this session:" : "Once the engine is up you get, in every session:");
	lines.push("  harnessy_execute  run code against every connected integration (policy + audit)");
	lines.push("  harnessy_skills   the engine's own how-to guide");
	lines.push("  harnessy_resume   approve/decline paused runs");
	lines.push("");
	lines.push(`Just ask for things ("what's connected?", "search my AnyType notes") — the model uses them.`);
	lines.push(`Connect integrations in the cockpit: \`harnessy web\` then open ${engineBaseUrl()}.`);
	return { ok, text: lines.join("\n") };
}

/** Built-in factory wired into ResourceLoader; disabled with HARNESSY_ENGINE=0. */
export function harnessyEngineExtension(pi: ExtensionAPI): void {
	pi.registerCommand("harnessy", {
		description: "Harnessy engine status and how to use it",
		handler: async (_args, ctx) => {
			const status = await engineStatus();
			ctx.ui.notify(status.text, status.ok ? "info" : "warning");
		},
	});

	pi.registerTool({
		name: "harnessy_execute",
		label: "Harnessy Execute",
		description: [
			"Run TypeScript against the Harnessy engine's connected tool catalog (integrations, connections, credentials, policies, audit).",
			'Call harnessy_skills({ name: "execute" }) FIRST for the full guide: how to search the catalog, call tools, emit results, and resume paused runs.',
			"A paused result means a human approval is pending; resume it with harnessy_resume.",
		].join("\n"),
		parameters: Type.Object({
			code: Type.String({ description: "TypeScript for the engine execute sandbox" }),
		}),
		execute: async (_toolCallId, params, signal) => {
			const { content } = await callEngine("execute", { code: params.code }, signal);
			return { content, details: undefined };
		},
	});

	pi.registerTool({
		name: "harnessy_skills",
		label: "Harnessy Skills",
		description:
			'Fetch a named Harnessy engine how-to skill (long-form guidance). Call harnessy_skills({ name: "execute" }) for the execute guide; omit name to list available skills.',
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: 'Skill to fetch, e.g. "execute". Omit to list.' })),
		}),
		execute: async (_toolCallId, params, signal) => {
			const { content } = await callEngine("skills", params.name === undefined ? {} : { name: params.name }, signal);
			return { content, details: undefined };
		},
	});

	pi.registerTool({
		name: "harnessy_resume",
		label: "Harnessy Resume",
		description:
			"Resume a paused Harnessy engine execution using the executionId returned by harnessy_execute (approve, decline, or cancel the pending interaction).",
		parameters: Type.Object({
			executionId: Type.String({ description: "The execution ID from the paused result" }),
			action: Type.Union([Type.Literal("accept"), Type.Literal("decline"), Type.Literal("cancel")], {
				description: "How to respond to the interaction",
			}),
			content: Type.Optional(
				Type.String({ description: "Optional JSON-encoded response content for form elicitations" }),
			),
		}),
		execute: async (_toolCallId, params, signal) => {
			const { content } = await callEngine(
				"resume",
				{ executionId: params.executionId, action: params.action, content: params.content ?? "{}" },
				signal,
			);
			return { content, details: undefined };
		},
	});
}

/** True unless the builtin is explicitly disabled via HARNESSY_ENGINE=0. */
export function harnessyEngineEnabled(): boolean {
	return process.env.HARNESSY_ENGINE !== "0";
}
