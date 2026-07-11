import { Console } from "effect";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { JarvisDiagnostic } from "../jarvis/diagnostic.ts";
import { JarvisParityReporter } from "../jarvis/parity-report.ts";
import { jsonOption, targetOption } from "./shared.ts";

export const jarvisDiagnoseCommand = Command.make(
	"diagnose",
	{ target: targetOption, json: jsonOption },
	({ target, json }) =>
		Effect.gen(function* () {
			const result = yield* (yield* JarvisDiagnostic).inspect(target);
			if (json) {
				yield* Console.log(
					JSON.stringify({ command: "jarvis diagnose", ok: result.issues.length === 0, ...result }, null, 2),
				);
				return;
			}

			yield* Console.log(`Jarvis compatibility: ${result.migrationStatus}`);
			yield* Console.log(`Target: ${result.paths.targetDir}`);
			yield* Console.log(`Canonical store: ${result.paths.canonicalGlobalRoot}`);
			yield* Console.log(`Legacy store: ${result.paths.legacyGlobalRoot}`);
			yield* Console.log(`Legacy config: ${result.config.status} (${result.config.path})`);
			const loaded = result.context.filter((entry) => entry.loaded);
			yield* Console.log(`Legacy context files loaded: ${loaded.length}/${result.context.length}`);
			for (const issue of result.issues) yield* Console.log(`Issue: ${issue}`);
		}),
).pipe(Command.withDescription("Inspect legacy Jarvis state without migrating or modifying it"));

export const jarvisParityCommand = Command.make("parity", { json: jsonOption }, ({ json }) =>
	Effect.gen(function* () {
		const report = yield* (yield* JarvisParityReporter).inspect();
		if (json) {
			yield* Console.log(JSON.stringify({ command: "jarvis parity", ok: true, ...report }, null, 2));
			return;
		}

		const { counts } = report.summary;
		yield* Console.log(`Jarvis parity (${report.sourceVersion}): ${counts.total} entries`);
		yield* Console.log(
			`Missing ${counts.missing} | Partial ${counts.partial} | Compatible ${counts.compatible} | Retired ${counts.intentionallyRetired}`,
		);
		for (const surface of report.summary.surfaces) {
			yield* Console.log(
				`${surface.surface}: ${surface.counts.compatible} compatible, ${surface.counts.partial} partial, ${surface.counts.missing} missing, ${surface.counts.intentionallyRetired} retired`,
			);
		}
	}),
).pipe(Command.withDescription("Validate and report the frozen Jarvis protocol parity ledger"));

export const jarvisCommand = Command.make("jarvis").pipe(
	Command.withSubcommands([jarvisDiagnoseCommand, jarvisParityCommand] as const),
	Command.withDescription("Inspect legacy Jarvis protocol state without modifying it"),
);
