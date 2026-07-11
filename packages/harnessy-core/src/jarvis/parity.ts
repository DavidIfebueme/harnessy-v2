import { Schema } from "effect";
import * as Effect from "effect/Effect";

import { causeMessage, HarnessError } from "../errors.ts";

export const JarvisParityStatus = Schema.Literals(["missing", "partial", "compatible", "intentionally-retired"]);
export type JarvisParityStatus = typeof JarvisParityStatus.Type;

export const JarvisProtocolSurface = Schema.Literals([
	"command",
	"state",
	"context",
	"connector",
	"workflow",
	"channel",
	"host-capability",
]);
export type JarvisProtocolSurface = typeof JarvisProtocolSurface.Type;

/** One auditable compatibility decision in the Jarvis protocol parity ledger. */
export class JarvisParityEntry extends Schema.Class<JarvisParityEntry>("JarvisParityEntry")({
	id: Schema.String,
	surface: JarvisProtocolSurface,
	legacyReference: Schema.String,
	status: JarvisParityStatus,
	replacement: Schema.optional(Schema.String),
	rationale: Schema.optional(Schema.String),
}) {}

/** Versioned parity ledger generated from the frozen Python compatibility oracle. */
export class JarvisParityManifest extends Schema.Class<JarvisParityManifest>("JarvisParityManifest")({
	schemaVersion: Schema.Literal(1),
	sourceVersion: Schema.String,
	entries: Schema.Array(JarvisParityEntry),
}) {}

export class JarvisCommandArgument extends Schema.Class<JarvisCommandArgument>("JarvisCommandArgument")({
	name: Schema.String,
	type: Schema.String,
	required: Schema.Boolean,
	nargs: Schema.Number,
	default: Schema.Unknown,
}) {}

export class JarvisCommandOption extends Schema.Class<JarvisCommandOption>("JarvisCommandOption")({
	names: Schema.Array(Schema.String),
	type: Schema.String,
	required: Schema.Boolean,
	multiple: Schema.Boolean,
	count: Schema.Boolean,
	default: Schema.Unknown,
	choices: Schema.optional(Schema.Array(Schema.Unknown)),
}) {}

export class JarvisCommandEntry extends Schema.Class<JarvisCommandEntry>("JarvisCommandEntry")({
	path: Schema.Array(Schema.String),
	kind: Schema.Literals(["group", "command"]),
	semanticName: Schema.String,
	alias: Schema.Boolean,
	help: Schema.String,
	arguments: Schema.Array(JarvisCommandArgument),
	options: Schema.Array(JarvisCommandOption),
}) {}

export class JarvisCommandManifest extends Schema.Class<JarvisCommandManifest>("JarvisCommandManifest")({
	schemaVersion: Schema.Literal(1),
	source: Schema.Struct({
		kind: Schema.Literal("jarvis-click"),
		version: Schema.String,
		path: Schema.String,
		pythonSourceSha256: Schema.String,
	}),
	generatedBy: Schema.String,
	normalization: Schema.Record(Schema.String, Schema.Unknown),
	commands: Schema.Array(JarvisCommandEntry),
}) {}

export const JarvisStateFormat = Schema.Literals([
	"yaml",
	"json",
	"text",
	"json-directory",
	"yaml-markdown-json-directory",
	"markdown-directory",
	"json-markdown-directory",
]);
export const JarvisMissingBehavior = Schema.Literals(["defaults", "empty", "none", "global-fallback"]);
export const JarvisMalformedBehavior = Schema.Literals([
	"error",
	"empty",
	"not-applicable",
	"skip-entry",
	"quarantine-or-skip",
]);

export class JarvisStateStoreManifest extends Schema.Class<JarvisStateStoreManifest>("JarvisStateStoreManifest")({
	id: Schema.String,
	pathTemplate: Schema.String,
	format: JarvisStateFormat,
	missingBehavior: JarvisMissingBehavior,
	malformedBehavior: JarvisMalformedBehavior,
	fixture: Schema.optional(Schema.String),
	malformedFixture: Schema.optional(Schema.String),
	source: Schema.String,
}) {}

export class JarvisStateManifest extends Schema.Class<JarvisStateManifest>("JarvisStateManifest")({
	schemaVersion: Schema.Literal(1),
	stores: Schema.Array(JarvisStateStoreManifest),
}) {}

const JarvisParityManifestJson = Schema.fromJsonString(JarvisParityManifest);
const JarvisCommandManifestJson = Schema.fromJsonString(JarvisCommandManifest);
const JarvisStateManifestJson = Schema.fromJsonString(JarvisStateManifest);

const parseManifest = <A, I>(schema: Schema.Codec<A, I, never, never>, label: string) =>
	Effect.fn(label)(function* (raw: string, sourcePath: string) {
		return yield* Schema.decodeUnknownEffect(schema)(raw).pipe(
			Effect.mapError(
				(cause) =>
					new HarnessError({
						message: `Invalid Jarvis manifest ${sourcePath}: ${causeMessage(cause)}`,
						cause,
					}),
			),
		);
	});

export const parseJarvisCommandManifest = parseManifest(JarvisCommandManifestJson, "JarvisCommandManifest.parse");
export const parseJarvisStateManifest = parseManifest(JarvisStateManifestJson, "JarvisStateManifest.parse");

export const parseJarvisParityManifest = Effect.fn("JarvisParityManifest.parse")(function* (
	raw: string,
	sourcePath: string,
) {
	return yield* Schema.decodeUnknownEffect(JarvisParityManifestJson)(raw).pipe(
		Effect.mapError(
			(cause) =>
				new HarnessError({
					message: `Invalid Jarvis parity manifest ${sourcePath}: ${causeMessage(cause)}`,
					cause,
				}),
		),
	);
});
