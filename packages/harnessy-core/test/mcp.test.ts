import { describe, expect, it } from "vitest";

import { buildMcpInstallArgs } from "../src/cli/mcp.ts";

describe("MCP installer invocation", () => {
	it("passes noninteractive approval to npx before the package and to add-mcp after it", () => {
		expect(
			buildMcpInstallArgs({
				endpoint: "http://127.0.0.1:4788/mcp",
				token: "engine-token",
				agents: ["claude"],
				userLevel: true,
				yes: true,
			}),
		).toEqual([
			"--yes",
			"add-mcp",
			"http://127.0.0.1:4788/mcp",
			"--transport",
			"http",
			"--name",
			"harnessy",
			"--header",
			"Authorization: Bearer engine-token",
			"--agent",
			"claude",
			"--global",
			"--yes",
		]);
	});

	it("omits both approval flags for interactive installs", () => {
		const args = buildMcpInstallArgs({
			endpoint: "http://127.0.0.1:4788/mcp",
			token: "engine-token",
			agents: [],
			userLevel: false,
			yes: false,
		});
		expect(args[0]).toBe("add-mcp");
		expect(args).not.toContain("--yes");
	});
});
