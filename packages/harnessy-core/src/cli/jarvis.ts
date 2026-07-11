import { Console } from "effect";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { JarvisDiagnostic } from "../jarvis/diagnostic.ts";
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

export const jarvisCommand = Command.make("jarvis").pipe(
	Command.withSubcommands([jarvisDiagnoseCommand] as const),
	Command.withDescription("Inspect legacy Jarvis protocol state without modifying it"),
);
