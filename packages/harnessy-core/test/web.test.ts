import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { registerBundledAnytype } from "../src/cli/web.ts";

describe("bundled AnyType cockpit registration", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const path of tempDirs) rmSync(path, { recursive: true, force: true });
	});

	it("registers the bundled spec with its pinned AnyType version header", async () => {
		const dataDir = join(tmpdir(), `harnessy-web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		tempDirs.push(dataDir);
		mkdirSync(join(dataDir, "server-control"), { recursive: true });
		writeFileSync(join(dataDir, "server-control", "auth.json"), JSON.stringify({ token: "engine-token" }));
		const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
		const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			const url = String(input);
			requests.push({ url, init });
			if (url.endsWith("/api/health")) return new Response("ok");
			if (url.endsWith("/api/openapi/integrations/anytype")) return Response.json(null);
			return Response.json({ slug: "anytype", toolCount: 3 });
		};

		await expect(registerBundledAnytype({ cockpitUrl: "http://127.0.0.1:4788", dataDir, fetchImpl })).resolves.toBe(
			"registered",
		);

		expect(requests.map((request) => request.url)).toEqual([
			"http://127.0.0.1:4788/api/health",
			"http://127.0.0.1:4788/api/openapi/integrations/anytype",
			"http://127.0.0.1:4788/api/openapi/specs",
		]);
		const registration = requests[2];
		expect(registration?.init?.headers).toEqual({
			Authorization: "Bearer engine-token",
			"content-type": "application/json",
		});
		const payload = JSON.parse(String(registration?.init?.body)) as {
			readonly slug: string;
			readonly headers: Readonly<Record<string, string>>;
			readonly spec: { readonly kind: string; readonly value: string };
		};
		expect(payload.slug).toBe("anytype");
		expect(payload.headers).toEqual({ "Anytype-Version": "2025-11-08" });
		expect(payload.spec.kind).toBe("blob");
		expect(payload.spec.value).toContain('"operationId": "spaces_list"');
	});

	it("leaves an existing AnyType integration unchanged", async () => {
		const dataDir = join(tmpdir(), `harnessy-web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		tempDirs.push(dataDir);
		mkdirSync(join(dataDir, "server-control"), { recursive: true });
		writeFileSync(join(dataDir, "server-control", "auth.json"), JSON.stringify({ token: "engine-token" }));
		let requestCount = 0;
		const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
			requestCount += 1;
			return String(input).endsWith("/api/health") ? new Response("ok") : Response.json({ slug: "anytype" });
		};

		await expect(registerBundledAnytype({ cockpitUrl: "http://127.0.0.1:4788", dataDir, fetchImpl })).resolves.toBe(
			"already-registered",
		);
		expect(requestCount).toBe(2);
	});
});
