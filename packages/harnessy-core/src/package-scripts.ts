import { FileSystem, Path } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { causeMessage, HarnessError } from "./errors.ts";
import type { HarnessPaths } from "./paths.ts";

/** Scripts Harnessy adds to package.json when no conflicting script exists. */
export const HARNESSY_PACKAGE_SCRIPTS = {
	"harnessy:verify": "harnessy verify",
	"harnessy:doctor": "harnessy doctor",
	"harnessy:deps": "harnessy deps check",
} as const;

/** Result of package.json script patching. */
export interface PackageScriptPatchResult {
	/** Absolute package.json path. */
	readonly packageJsonPath: string;
	/** Whether package.json exists. */
	readonly packageJsonExists: boolean;
	/** Whether the file was changed. */
	readonly changed: boolean;
	/** Scripts added in this pass. */
	readonly added: ReadonlyArray<string>;
	/** Harnessy script keys already present before patching. */
	readonly existing: ReadonlyArray<string>;
}

/** Narrow unknown JSON values to mutable records for package.json patching. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Preserve unknown package.json fields while ensuring `scripts` is a plain object. */
const getScriptsRecord = (pkg: Record<string, unknown>): Record<string, unknown> => {
	const scripts = pkg.scripts;
	if (isRecord(scripts)) return scripts;
	const nextScripts: Record<string, unknown> = {};
	pkg.scripts = nextScripts;
	return nextScripts;
};

/** Adds Harnessy lifecycle scripts to package.json when safe. */
export class PackageScripts extends Context.Service<
	PackageScripts,
	{
		/** Add missing Harnessy package scripts without overwriting existing entries. */
		readonly patch: (paths: HarnessPaths) => Effect.Effect<PackageScriptPatchResult, HarnessError>;
	}
>()("@harnessy/core/PackageScripts") {
	/** Live package script patcher backed by platform filesystem and path services. */
	static readonly layer = Layer.effect(
		PackageScripts,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;

			/** Convert platform failures into the Harnessy typed error channel. */
			const mapPlatformError = (action: string, cause: unknown): HarnessError =>
				new HarnessError({ message: `${action}: ${causeMessage(cause)}`, cause });

			const patch = Effect.fn("PackageScripts.patch")(function* (paths: HarnessPaths) {
				const packageJsonPath = path.join(paths.targetDir, "package.json");
				const packageJsonExists = yield* fs
					.exists(packageJsonPath)
					.pipe(Effect.mapError((cause) => mapPlatformError(`Could not inspect ${packageJsonPath}`, cause)));
				if (!packageJsonExists) {
					return {
						packageJsonPath,
						packageJsonExists,
						changed: false,
						added: [],
						existing: [],
					} satisfies PackageScriptPatchResult;
				}

				const raw = yield* fs
					.readFileString(packageJsonPath)
					.pipe(Effect.mapError((cause) => mapPlatformError(`Could not read ${packageJsonPath}`, cause)));
				let parsed: unknown;
				try {
					parsed = JSON.parse(raw);
				} catch (cause) {
					return yield* new HarnessError({
						message: `Invalid package.json ${packageJsonPath}: ${causeMessage(cause)}`,
						cause,
					});
				}
				if (!isRecord(parsed)) {
					return yield* new HarnessError({ message: `Invalid package.json ${packageJsonPath}: expected object` });
				}

				const scripts = getScriptsRecord(parsed);
				const added: Array<string> = [];
				const existing: Array<string> = [];
				for (const [name, command] of Object.entries(HARNESSY_PACKAGE_SCRIPTS)) {
					if (typeof scripts[name] === "string") {
						existing.push(name);
						continue;
					}
					scripts[name] = command;
					added.push(name);
				}

				if (added.length > 0) {
					yield* fs
						.writeFileString(packageJsonPath, `${JSON.stringify(parsed, null, "\t")}\n`)
						.pipe(Effect.mapError((cause) => mapPlatformError(`Could not write ${packageJsonPath}`, cause)));
				}

				return {
					packageJsonPath,
					packageJsonExists,
					changed: added.length > 0,
					added,
					existing,
				} satisfies PackageScriptPatchResult;
			});

			return { patch };
		}),
	);
}
