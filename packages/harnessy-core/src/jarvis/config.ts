import { FileSystem, Schema, SchemaTransformation } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { parseDocument } from "yaml";

import { causeMessage, HarnessError } from "../errors.ts";
import type { JarvisPaths } from "./paths.ts";

export const JarvisConfigStatus = Schema.Literals(["missing", "valid", "invalid"]);
export type JarvisConfigStatus = typeof JarvisConfigStatus.Type;

const LegacyBackend = Schema.Literals(["anytype", "notion"]);
const NullableString = Schema.NullOr(Schema.String);
const LegacyIntegerFromString = Schema.Trim.pipe(
	Schema.check(Schema.isPattern(/^[+-]?\d(?:_?\d)*(?:\.0+)?$/)),
	Schema.decodeTo(
		Schema.String,
		SchemaTransformation.transform({ decode: (value) => value.replaceAll("_", ""), encode: (value) => value }),
	),
	Schema.decodeTo(Schema.Int, SchemaTransformation.numberFromString),
);
const LegacyInteger = Schema.Union([Schema.Int, LegacyIntegerFromString, Schema.flip(Schema.BooleanFromBit)]);
const LegacyTrueString = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^(?:1|true|t|on|yes|y)$/i)),
	Schema.decodeTo(
		Schema.Literal(true),
		SchemaTransformation.transform({ decode: () => true as const, encode: () => "true" }),
	),
);
const LegacyFalseString = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^(?:0|false|f|off|no|n)$/i)),
	Schema.decodeTo(
		Schema.Literal(false),
		SchemaTransformation.transform({ decode: () => false as const, encode: () => "false" }),
	),
);
const LegacyBoolean = Schema.Union([Schema.Boolean, Schema.BooleanFromBit, LegacyTrueString, LegacyFalseString]);
const LegacyNotionConfig = Schema.Struct({
	workspace_id: Schema.String,
	task_database_id: Schema.String,
	journal_database_id: Schema.String,
	property_mappings: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const LegacyAnytypeConfig = Schema.Struct({
	default_space_id: Schema.optional(NullableString),
});
const LegacyFathomAccountConfig = Schema.Struct({
	email: Schema.optional(NullableString),
	api_key_env_var: Schema.optional(Schema.String),
	webhook_secret_env_var: Schema.optional(Schema.String),
	webhook_id: Schema.optional(NullableString),
	webhook_destination_url: Schema.optional(NullableString),
});
const LegacyWhatsAppAccountConfig = Schema.Struct({
	provider: Schema.optional(Schema.Literal("meta")),
	phone_number_id: Schema.optional(NullableString),
	business_account_id: Schema.optional(NullableString),
	access_token_env_var: Schema.optional(Schema.String),
	app_secret_env_var: Schema.optional(Schema.String),
	verify_token_env_var: Schema.optional(Schema.String),
	api_version: Schema.optional(Schema.String),
	webhook_destination_url: Schema.optional(NullableString),
});
const LegacyJarvisConfig = Schema.Struct({
	version: Schema.optional(LegacyInteger),
	active_backend: Schema.optional(LegacyBackend),
	backends: Schema.optional(
		Schema.Struct({
			anytype: Schema.optional(LegacyAnytypeConfig),
			notion: Schema.optional(Schema.NullOr(LegacyNotionConfig)),
		}),
	),
	content: Schema.optional(
		Schema.Struct({
			root_path: Schema.optional(NullableString),
			anytype_space_name: Schema.optional(NullableString),
			anytype_root_collection: Schema.optional(Schema.String),
		}),
	),
	analytics: Schema.optional(
		Schema.Struct({
			enabled: Schema.optional(LegacyBoolean),
			metrics_file: Schema.optional(Schema.String),
		}),
	),
	fathom: Schema.optional(
		Schema.Struct({
			default_account: Schema.optional(NullableString),
			accounts: Schema.optional(Schema.Record(Schema.String, LegacyFathomAccountConfig)),
		}),
	),
	whatsapp: Schema.optional(
		Schema.Struct({
			default_account: Schema.optional(NullableString),
			accounts: Schema.optional(Schema.Record(Schema.String, LegacyWhatsAppAccountConfig)),
		}),
	),
});

/** Redacted, read-only result of inspecting legacy Jarvis YAML configuration. */
export class JarvisConfigInspection extends Schema.Class<JarvisConfigInspection>("JarvisConfigInspection")({
	status: JarvisConfigStatus,
	path: Schema.String,
	version: Schema.NullOr(Schema.Number),
	activeBackend: Schema.NullOr(LegacyBackend),
	configuredBackends: Schema.Array(LegacyBackend),
	sections: Schema.Array(Schema.String),
	issues: Schema.Array(Schema.String),
}) {}

const missingInspection = (path: string) =>
	new JarvisConfigInspection({
		status: "missing",
		path,
		version: null,
		activeBackend: null,
		configuredBackends: [],
		sections: [],
		issues: [],
	});

const invalidInspection = (path: string, issues: ReadonlyArray<string>) =>
	new JarvisConfigInspection({
		status: "invalid",
		path,
		version: null,
		activeBackend: null,
		configuredBackends: [],
		sections: [],
		issues,
	});

const LegacyNullConfig = Schema.Null.pipe(
	Schema.decodeTo(LegacyJarvisConfig, SchemaTransformation.transform({ decode: () => ({}), encode: () => null })),
);
const LegacyFalseConfig = Schema.Literal(false).pipe(
	Schema.decodeTo(LegacyJarvisConfig, SchemaTransformation.transform({ decode: () => ({}), encode: () => false })),
);
const LegacyZeroConfig = Schema.Literal(0).pipe(
	Schema.decodeTo(LegacyJarvisConfig, SchemaTransformation.transform({ decode: () => ({}), encode: () => 0 })),
);
const LegacyEmptyStringConfig = Schema.Literal("").pipe(
	Schema.decodeTo(LegacyJarvisConfig, SchemaTransformation.transform({ decode: () => ({}), encode: () => "" })),
);
const LegacyEmptyArrayConfig = Schema.Tuple([]).pipe(
	Schema.decodeTo(
		LegacyJarvisConfig,
		SchemaTransformation.transform({ decode: () => ({}), encode: () => [] as const }),
	),
);
const LegacyJarvisConfigInput = Schema.Union([
	LegacyJarvisConfig,
	LegacyNullConfig,
	LegacyFalseConfig,
	LegacyZeroConfig,
	LegacyEmptyStringConfig,
	LegacyEmptyArrayConfig,
]);

/** Inspects legacy Jarvis config without exposing secrets or mutating files. */
export class JarvisConfigReader extends Context.Service<
	JarvisConfigReader,
	{
		readonly inspectLegacy: (paths: JarvisPaths) => Effect.Effect<JarvisConfigInspection, HarnessError>;
	}
>()("@harnessy/core/JarvisConfigReader") {
	static readonly layer = Layer.effect(
		JarvisConfigReader,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;

			const inspectLegacy = Effect.fn("JarvisConfigReader.inspectLegacy")(function* (paths: JarvisPaths) {
				const configPath = paths.legacyGlobalConfigFile;
				const present = yield* fs.exists(configPath).pipe(
					Effect.mapError(
						(cause) =>
							new HarnessError({
								message: `Could not inspect Jarvis config ${configPath}: ${causeMessage(cause)}`,
								cause,
							}),
					),
				);
				if (!present) return missingInspection(configPath);

				const raw = yield* fs.readFileString(configPath).pipe(
					Effect.mapError(
						(cause) =>
							new HarnessError({
								message: `Could not read Jarvis config ${configPath}: ${causeMessage(cause)}`,
								cause,
							}),
					),
				);
				const document = parseDocument(raw);
				if (document.errors.length > 0) {
					return invalidInspection(configPath, ["Invalid YAML syntax in legacy Jarvis configuration."]);
				}

				const value = yield* Effect.try({
					try: () => document.toJS() as unknown,
					catch: (cause) => cause,
				}).pipe(
					Effect.match({
						onFailure: (cause) => ({ ok: false as const, cause }),
						onSuccess: (decoded) => ({ ok: true as const, decoded }),
					}),
				);
				if (!value.ok) return invalidInspection(configPath, ["Could not decode legacy Jarvis YAML configuration."]);
				return yield* Schema.decodeUnknownEffect(LegacyJarvisConfigInput)(value.decoded).pipe(
					Effect.match({
						onFailure: () =>
							invalidInspection(configPath, ["Legacy Jarvis configuration failed schema validation."]),
						onSuccess: (config) =>
							new JarvisConfigInspection({
								status: "valid",
								path: configPath,
								version: config.version ?? 1,
								activeBackend: config.active_backend ?? "anytype",
								configuredBackends: [
									"anytype",
									...(config.backends?.notion !== undefined && config.backends.notion !== null
										? (["notion"] as const)
										: []),
								],
								sections: Object.keys(config).sort(),
								issues: [],
							}),
					}),
				);
			});

			return { inspectLegacy };
		}),
	);
}
