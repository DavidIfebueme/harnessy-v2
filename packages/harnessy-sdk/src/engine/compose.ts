import { type AnyPlugin, ConnectionName, type Executor, IntegrationSlug, ToolAddress } from "@executor-js/sdk/core";
import { Effect, Schema } from "effect";

export const EngineOwner = Schema.Literals(["org", "user"]);
export type EngineOwner = typeof EngineOwner.Type;

export class EngineConnection extends Schema.Class<EngineConnection>("EngineConnection")({
	owner: EngineOwner,
	integration: Schema.String,
	name: Schema.String,
}) {}

export class EngineTool extends Schema.Class<EngineTool>("EngineTool")({
	address: Schema.String,
	owner: EngineOwner,
	integration: Schema.String,
	connection: Schema.String,
	name: Schema.String,
	description: Schema.String,
}) {}

export class EngineIntegration extends Schema.Class<EngineIntegration>("EngineIntegration")({
	slug: Schema.String,
	name: Schema.String,
	description: Schema.String,
	kind: Schema.String,
}) {}

export class EngineHealth extends Schema.Class<EngineHealth>("EngineHealth")({
	status: Schema.Literals(["healthy", "expired", "degraded", "unknown"]),
	httpStatus: Schema.optional(Schema.Number),
	identity: Schema.optional(Schema.String),
	checkedAt: Schema.Number,
	detail: Schema.optional(Schema.String),
}) {}

export class EnginePolicyDecision extends Schema.Class<EnginePolicyDecision>("EnginePolicyDecision")({
	action: Schema.Literals(["approve", "require_approval", "block"]),
	source: Schema.Literals(["user", "plugin-default"]),
	pattern: Schema.optional(Schema.String),
	policyId: Schema.optional(Schema.String),
}) {}

export interface EngineConnectionRef {
	readonly owner: EngineOwner;
	readonly integration: string;
	readonly name: string;
}

/** Harnessy-owned structural boundary. No vendored engine type crosses this interface. */
export interface HarnessyEngineHandle {
	readonly execute: (address: string, args: unknown) => Effect.Effect<unknown, unknown>;
	readonly connections: {
		readonly list: (filter?: {
			readonly integration?: string;
			readonly owner?: EngineOwner;
		}) => Effect.Effect<ReadonlyArray<EngineConnection>, unknown>;
		readonly checkHealth: (ref: EngineConnectionRef) => Effect.Effect<EngineHealth, unknown>;
	};
	readonly tools: {
		readonly list: (filter?: {
			readonly integration?: string;
			readonly owner?: EngineOwner;
			readonly connection?: string;
		}) => Effect.Effect<ReadonlyArray<EngineTool>, unknown>;
	};
	readonly integrations: {
		readonly list: () => Effect.Effect<ReadonlyArray<EngineIntegration>, unknown>;
	};
	readonly policies: {
		readonly resolve: (address: string) => Effect.Effect<EnginePolicyDecision, unknown>;
	};
}

export const engineToolAddress = (input: {
	readonly integration: string;
	readonly owner: EngineOwner;
	readonly connection: string;
	readonly tool: string;
}): string => `tools.${input.integration}.${input.owner}.${input.connection}.${input.tool}`;

/** Adapt the full vendored Executor surface once, inside the confined engine module. */
export const harnessyEngineHandle = <TPlugins extends readonly AnyPlugin[]>(
	executor: Executor<TPlugins>,
): HarnessyEngineHandle => ({
	execute: (address, args) => executor.execute(ToolAddress.make(address), args),
	connections: {
		list: (filter) =>
			executor.connections
				.list({
					...(filter?.integration === undefined ? {} : { integration: IntegrationSlug.make(filter.integration) }),
					...(filter?.owner === undefined ? {} : { owner: filter.owner }),
				})
				.pipe(
					Effect.map((connections) =>
						connections.map(
							(connection) =>
								new EngineConnection({
									owner: connection.owner,
									integration: String(connection.integration),
									name: String(connection.name),
								}),
						),
					),
				),
		checkHealth: (ref) =>
			executor.connections
				.checkHealth({
					owner: ref.owner,
					integration: IntegrationSlug.make(ref.integration),
					name: ConnectionName.make(ref.name),
				})
				.pipe(Effect.map((health) => new EngineHealth(health))),
	},
	tools: {
		list: (filter) =>
			executor.tools
				.list({
					...(filter?.integration === undefined ? {} : { integration: IntegrationSlug.make(filter.integration) }),
					...(filter?.owner === undefined ? {} : { owner: filter.owner }),
					...(filter?.connection === undefined ? {} : { connection: ConnectionName.make(filter.connection) }),
				})
				.pipe(
					Effect.map((tools) =>
						tools.map(
							(tool) =>
								new EngineTool({
									address: String(tool.address),
									owner: tool.owner,
									integration: String(tool.integration),
									connection: String(tool.connection),
									name: String(tool.name),
									description: tool.description,
								}),
						),
					),
				),
	},
	integrations: {
		list: () =>
			executor.integrations.list().pipe(
				Effect.map((integrations) =>
					integrations.map(
						(integration) =>
							new EngineIntegration({
								slug: String(integration.slug),
								name: integration.name,
								description: integration.description,
								kind: integration.kind,
							}),
					),
				),
			),
	},
	policies: {
		resolve: (address) =>
			executor.policies
				.resolve(ToolAddress.make(address))
				.pipe(Effect.map((decision) => new EnginePolicyDecision(decision))),
	},
});
