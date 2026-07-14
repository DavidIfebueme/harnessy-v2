import { homedir } from "node:os";
import { join } from "node:path";

import { fileSecretsPlugin } from "@executor-js/plugin-file-secrets";
import { mcpPlugin } from "@executor-js/plugin-mcp";
import { openApiPlugin } from "@executor-js/plugin-openapi";
import { createExecutor, Effect, type Executor, type OnElicitation, Subject, Tenant } from "@executor-js/sdk/core";

import { harnessyAnytypePlugin } from "./plugins/anytype.ts";

const makePlugins = (credentialDirectory: string) =>
	[
		openApiPlugin(),
		mcpPlugin(),
		harnessyAnytypePlugin(),
		fileSecretsPlugin({ directory: credentialDirectory }),
	] as const;

export type HarnessyEnginePlugins = ReturnType<typeof makePlugins>;
export type HarnessyEngine = Executor<HarnessyEnginePlugins>;

export interface HarnessyEngineConfig {
	readonly tenant: string;
	readonly subject?: string;
	readonly onElicitation: OnElicitation;
	readonly credentialDirectory?: string;
}

/**
 * Scoped, Effect-native Harnessy engine composition.
 *
 * The returned engine closes automatically with the surrounding Scope. Executor
 * and every default plugin resolve the same root Effect runtime through the
 * source aliases in this package's Bundler-mode tsconfig.
 */
export const makeHarnessyEngine = Effect.fn("HarnessySdk.makeHarnessyEngine")(function* (config: HarnessyEngineConfig) {
	const credentialDirectory = config.credentialDirectory ?? join(homedir(), ".harnessy", "engine-credentials");
	const executor = yield* Effect.acquireRelease(
		createExecutor({
			tenant: Tenant.make(config.tenant),
			...(config.subject === undefined ? {} : { subject: Subject.make(config.subject) }),
			onElicitation: config.onElicitation,
			plugins: makePlugins(credentialDirectory),
		}),
		(executor) => executor.close().pipe(Effect.orDie),
	);
	yield* executor["harnessy-anytype"].register();
	return executor;
});
