import { existsSync } from "node:fs";
import process from "node:process";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { resolveExecutorBuiltin, resolvePackagedExecutor, runExecutorBuiltin } from "../src/executor-builtin.ts";

describe("bundled Executor launcher", () => {
	it("uses the explicit binary override without adding a Harnessy runtime wrapper", () => {
		expect(resolveExecutorBuiltin({ HARNESSY_EXECUTOR_BIN: "/opt/executor" })).toEqual({
			command: "/opt/executor",
			args: [],
		});
	});

	it("uses the vendored Executor CLI in the development checkout", () => {
		const launch = resolveExecutorBuiltin({});
		expect(launch.command).toBe("bun");
		expect(launch.args).toHaveLength(2);
		expect(launch.args[0]).toBe("run");
		expect(launch.args[1]).toMatch(/executor[/\\]apps[/\\]cli[/\\]src[/\\]main\.ts$/);
		expect(existsSync(launch.args[1]!)).toBe(true);
	});

	it("packages the official platform-selecting Executor npm wrapper", () => {
		const launch = resolvePackagedExecutor();
		expect(launch.command).toBe(process.execPath);
		expect(launch.args).toHaveLength(1);
		expect(launch.args[0]).toMatch(/node_modules[/\\]executor[/\\]bin[/\\]executor$/);
		expect(existsSync(launch.args[0]!)).toBe(true);
	});

	it("does not report a signal-terminated child as successful", async () => {
		const exitCode = await Effect.runPromise(
			runExecutorBuiltin({
				launch: {
					command: process.execPath,
					args: ["-e", 'process.kill(process.pid, "SIGTERM")'],
				},
				args: [],
			}),
		);

		expect(exitCode).not.toBe(0);
	});
});
