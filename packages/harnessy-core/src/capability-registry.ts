import { FileSystem, Path } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CAPABILITY_MANIFEST_NAME, parseCapabilityManifest } from "./capability-manifest.ts";
import { type CapabilityMaterializationResult, CapabilityMaterializer } from "./capability-materializer.ts";
import {
	CapabilityEntry,
	type CapabilitySource,
	defaultCapabilityName,
	localCapabilityPath,
	makeCapabilityId,
	parseCapabilitySource,
} from "./capability-source.ts";
import { causeMessage, HarnessError } from "./errors.ts";
import { formatManifestJson, HarnessLockfile } from "./lockfile.ts";
import { LockfileStore } from "./lockfile-store.ts";
import type { HarnessPaths } from "./paths.ts";

/** Result of recording a capability source. */
export interface AddCapabilityResult {
	/** Newly created capability entry, or the existing duplicate entry. */
	readonly capability: CapabilityEntry;
	/** Whether this call changed the lockfile. */
	readonly added: boolean;
	/** Manifest path written for a new capability. */
	readonly manifestPath: string | null;
	/** Resource materialization result for a new capability, when attempted. */
	readonly materialization: CapabilityMaterializationResult | null;
}

/** Manages capability records, manifests, and local path verification. */
export class CapabilityRegistry extends Context.Service<
	CapabilityRegistry,
	{
		/** Read installed capability records from the lockfile. */
		readonly list: (paths: HarnessPaths) => Effect.Effect<ReadonlyArray<CapabilityEntry>, HarnessError>;
		/** Read one installed capability by id. */
		readonly inspect: (paths: HarnessPaths, id: string) => Effect.Effect<CapabilityEntry, HarnessError>;
		/** Record a capability source in the lockfile and emit a manifest stub for later resolvers. */
		readonly add: (
			paths: HarnessPaths,
			rawSource: string,
			rawId: string | undefined,
		) => Effect.Effect<AddCapabilityResult, HarnessError>;
		/** Verify capability records that can be checked locally. */
		readonly verify: (
			paths: HarnessPaths,
			lockfile: HarnessLockfile,
		) => Effect.Effect<ReadonlyArray<string>, HarnessError>;
	}
>()("@harnessy/core/CapabilityRegistry") {
	/** Live capability registry backed by the lockfile store and platform filesystem services. */
	static readonly layer = Layer.effect(
		CapabilityRegistry,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const lockfiles = yield* LockfileStore;
			const materializer = yield* CapabilityMaterializer;

			/** Convert platform failures into the Harnessy typed error channel. */
			const mapPlatformError = (action: string, cause: unknown): HarnessError =>
				new HarnessError({ message: `${action}: ${causeMessage(cause)}`, cause });

			/** Read a local capability-owned manifest when the source root contains one. */
			const readLocalManifest = (paths: HarnessPaths, source: CapabilitySource) =>
				Effect.gen(function* () {
					const localPath = yield* localCapabilityPath(paths.targetDir, source).pipe(
						Effect.provideService(Path.Path, path),
					);
					if (localPath === null) return null;
					if (
						!(yield* fs
							.exists(localPath)
							.pipe(Effect.mapError((cause) => mapPlatformError(`Could not inspect ${localPath}`, cause))))
					) {
						return null;
					}
					const manifestPath = path.join(localPath, CAPABILITY_MANIFEST_NAME);
					if (
						!(yield* fs
							.exists(manifestPath)
							.pipe(Effect.mapError((cause) => mapPlatformError(`Could not inspect ${manifestPath}`, cause))))
					) {
						return null;
					}
					const raw = yield* fs
						.readFileString(manifestPath)
						.pipe(Effect.mapError((cause) => mapPlatformError(`Could not read ${manifestPath}`, cause)));
					return yield* parseCapabilityManifest(raw, manifestPath);
				});

			/** Materialize local capability resources into the Harnessy artifact directory for new entries. */
			const materializeCapability = (paths: HarnessPaths, capability: CapabilityEntry) =>
				capability.manifest?.resources === undefined
					? Effect.succeed(null)
					: materializer.materialize(paths, capability);

			const capabilityManifestPath = (paths: HarnessPaths, capability: CapabilityEntry): string => {
				const filename = capability.id.replace(/[^a-z0-9._-]+/g, "-");
				return path.join(paths.capabilitiesDir, `${filename}.json`);
			};

			/** Write an adjacent per-capability manifest for easy inspection by humans and agents. */
			const writeCapabilityManifest = (paths: HarnessPaths, capability: CapabilityEntry) =>
				Effect.gen(function* () {
					const manifestPath = capabilityManifestPath(paths, capability);
					yield* fs
						.writeFileString(manifestPath, formatManifestJson(capability))
						.pipe(Effect.mapError((cause) => mapPlatformError(`Could not write ${manifestPath}`, cause)));
					return manifestPath;
				});

			const syncCapabilityArtifacts = Effect.fn("CapabilityRegistry.syncCapabilityArtifacts")(function* (
				paths: HarnessPaths,
				capability: CapabilityEntry,
			) {
				const manifestPath = yield* writeCapabilityManifest(paths, capability);
				const materialization = yield* materializeCapability(paths, capability);
				return { manifestPath, materialization } as const;
			});

			/** Verify one local capability path. Remote capability sources are deferred to later resolvers. */
			const verifyLocalCapability = (paths: HarnessPaths, capability: CapabilityEntry) =>
				Effect.gen(function* () {
					const localPath = yield* localCapabilityPath(paths.targetDir, capability.source).pipe(
						Effect.provideService(Path.Path, path),
					);
					if (localPath === null) return null;
					const exists = yield* fs
						.exists(localPath)
						.pipe(Effect.mapError((cause) => mapPlatformError(`Could not inspect ${localPath}`, cause)));
					if (!exists) return `Local capability ${capability.id} points to missing path: ${localPath}`;
					yield* readLocalManifest(paths, capability.source);
					return null;
				});

			const list = Effect.fn("CapabilityRegistry.list")(function* (paths: HarnessPaths) {
				const lockfile = yield* lockfiles.read(paths);
				return lockfile.capabilities;
			});

			const inspect = Effect.fn("CapabilityRegistry.inspect")(function* (paths: HarnessPaths, id: string) {
				const lockfile = yield* lockfiles.read(paths);
				const capability = lockfile.capabilities.find((entry) => entry.id === id);
				if (capability === undefined) {
					return yield* new HarnessError({ message: `Capability not found: ${id}` });
				}
				return capability;
			});

			const add = Effect.fn("CapabilityRegistry.add")(function* (
				paths: HarnessPaths,
				rawSource: string,
				rawId: string | undefined,
			) {
				const lockfile = yield* lockfiles.read(paths);
				const source = yield* parseCapabilitySource(rawSource);
				const manifest = yield* readLocalManifest(paths, source);
				const name =
					manifest?.name ?? (yield* defaultCapabilityName(source).pipe(Effect.provideService(Path.Path, path)));
				const id = rawId ?? manifest?.id ?? makeCapabilityId(source.type, name);
				const duplicate = lockfile.capabilities.find(
					(capability) => capability.id === id || capability.source.value === source.value,
				);
				if (duplicate !== undefined) {
					const artifacts = yield* syncCapabilityArtifacts(paths, duplicate);
					return {
						capability: duplicate,
						added: false,
						manifestPath: artifacts.manifestPath,
						materialization: artifacts.materialization,
					} satisfies AddCapabilityResult;
				}

				const manifestFields = manifest === null ? {} : { manifest };
				const capability = new CapabilityEntry({
					id,
					source,
					addedAt: new Date().toISOString(),
					...manifestFields,
				});
				const nextLockfile = new HarnessLockfile({
					...lockfile,
					capabilities: [...lockfile.capabilities, capability],
				});
				const artifacts = yield* syncCapabilityArtifacts(paths, capability);
				yield* lockfiles.write(paths, nextLockfile);
				return {
					capability,
					added: true,
					manifestPath: artifacts.manifestPath,
					materialization: artifacts.materialization,
				} satisfies AddCapabilityResult;
			});

			const verify = Effect.fn("CapabilityRegistry.verify")(function* (
				paths: HarnessPaths,
				lockfile: HarnessLockfile,
			) {
				const issues: Array<string> = [];
				for (const capability of lockfile.capabilities) {
					const issue = yield* verifyLocalCapability(paths, capability);
					if (issue !== null) issues.push(issue);
				}
				return issues;
			});

			return { list, inspect, add, verify };
		}),
	);
}
