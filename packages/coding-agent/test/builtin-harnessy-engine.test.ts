import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";

/**
 * The suite-wide setup disables the harnessy-engine builtin so upstream
 * fixture tests stay exact; this file re-enables it and covers the builtin:
 * it ships with the loader itself (no configuration), and its tools fail
 * with actionable guidance when the engine has never been started.
 */
describe("builtin harnessy-engine extension", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let savedEngineFlag: string | undefined;
	let savedDataDir: string | undefined;

	beforeEach(() => {
		tempDir = join(tmpdir(), `harnessy-builtin-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		savedEngineFlag = process.env.HARNESSY_ENGINE;
		savedDataDir = process.env.HARNESSY_ENGINE_DATA_DIR;
		process.env.HARNESSY_ENGINE = "1";
		// An empty data dir means no engine has ever run: token file is absent.
		process.env.HARNESSY_ENGINE_DATA_DIR = join(tempDir, "engine-data");
	});

	afterEach(() => {
		process.env.HARNESSY_ENGINE = savedEngineFlag;
		if (savedDataDir === undefined) {
			delete process.env.HARNESSY_ENGINE_DATA_DIR;
		} else {
			process.env.HARNESSY_ENGINE_DATA_DIR = savedDataDir;
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("ships the harnessy tools with the loader itself, without any configuration", async () => {
		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		const builtin = loader
			.getExtensions()
			.extensions.find((extension) => extension.path === "<inline:harnessy-engine>");
		expect(builtin).toBeDefined();
		expect([...(builtin?.tools.keys() ?? [])].sort()).toEqual([
			"harnessy_execute",
			"harnessy_resume",
			"harnessy_skills",
		]);
		expect(builtin?.commands.has("harnessy")).toBe(true);
	});

	it("is absent when explicitly disabled with HARNESSY_ENGINE=0", async () => {
		process.env.HARNESSY_ENGINE = "0";
		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		expect(loader.getExtensions().extensions.some((extension) => extension.path === "<inline:harnessy-engine>")).toBe(
			false,
		);
	});

	it("fails tool calls with harnessy web guidance when the engine has never started", async () => {
		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		const builtin = loader
			.getExtensions()
			.extensions.find((extension) => extension.path === "<inline:harnessy-engine>");
		const execute = builtin?.tools.get("harnessy_execute");
		expect(execute).toBeDefined();

		await expect(
			execute!.definition.execute("test-call", { code: "1" }, undefined, undefined, {} as never),
		).rejects.toThrow(/harnessy web/);
	});
});
