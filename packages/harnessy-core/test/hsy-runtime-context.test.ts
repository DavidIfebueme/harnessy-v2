import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";

import {
	buildHarnessyRuntimeContext,
	createHarnessyRuntimeContextMessage,
	resolveHarnessyAgentName,
} from "../src/hsy-welcome-extension.ts";

describe("Harnessy runtime context", () => {
	it("teaches the agent its isolated host paths and self-healing rule", () => {
		const context = buildHarnessyRuntimeContext("/work/project", {
			HSY_CODING_AGENT_DIR: "/home/tester/.hsy/agent",
		});

		expect(context).toContain("inside Harnessy (hsy), not the pi executable");
		expect(context).toContain('Your agent name is "Jarvis"');
		expect(context).toContain('Canonical global agent directory: "/home/tester/.hsy/agent"');
		expect(context).toContain('Canonical project configuration directory: "/work/project/.hsy"');
		expect(context).toContain("filesystem paths targeting .pi are compatibility defects");
		expect(context).toContain("inspect the failing Harnessy-local resource, repair it");
		expect(context).toContain("never patch or share Pi's configuration");
	});

	it("reads a configured agent name from Harnessy settings", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "hsy-agent-name-"));
		try {
			writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ agentName: "Friday" }));

			expect(resolveHarnessyAgentName({ HSY_CODING_AGENT_DIR: agentDir })).toBe("Friday");
			expect(buildHarnessyRuntimeContext("/work/project", { HSY_CODING_AGENT_DIR: agentDir })).toContain(
				'Your agent name is "Friday"',
			);
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	it("creates one hidden session-start context block", () => {
		const message = createHarnessyRuntimeContextMessage("/work/project", {
			HSY_CODING_AGENT_DIR: "/tmp/hsy-agent",
		});

		expect(message.customType).toBe("harnessy-runtime-context");
		expect(message.display).toBe(false);
		expect(message.content).toMatch(/^<harnessy_runtime>[\s\S]*<\/harnessy_runtime>$/);
	});
});
