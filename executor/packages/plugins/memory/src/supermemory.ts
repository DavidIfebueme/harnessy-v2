import { Effect } from "effect";
import Supermemory from "supermemory";

import { FilesystemAdapter } from "./filesystem";
import type { MemoryBlock, MemoryProfile, MemoryService, MemoryType } from "./types";

interface ContainerTags {
	readonly userTag: string;
	readonly projectTag: string;
}

function mapType(content: string): MemoryType {
	const lower = content.toLowerCase();
	if (lower.includes("prefer") || lower.includes("like") || lower.includes("style")) {
		return "preference";
	}
	if (lower.includes("decided") || lower.includes("chose") || lower.includes("rationale")) {
		return "decision";
	}
	if (lower.includes("event") || lower.includes("milestone") || lower.includes("deployed")) {
		return "event";
	}
	return "fact";
}

function mergeProfiles(user: MemoryProfile, project: MemoryProfile): MemoryProfile {
	const allFacts = [...user.facts, ...project.facts];
	const allPreferences = [...user.preferences, ...project.preferences];

	const summaryParts: string[] = [];
	if (user.summary) summaryParts.push(user.summary);
	if (project.summary) summaryParts.push(project.summary);

	return {
		facts: allFacts,
		preferences: allPreferences,
		summary: summaryParts.join("\n"),
	};
}

export class SupermemoryAdapter implements MemoryService {
	private readonly client: Supermemory;
	private readonly fallback: FilesystemAdapter;
	private readonly tags: ContainerTags;

	constructor(apiKey: string, tags: ContainerTags, projectRoot: string) {
		this.tags = tags;
		this.client = new Supermemory({ apiKey });
		this.fallback = new FilesystemAdapter(projectRoot);
	}

	private async loadFromContainer(containerTag: string): Promise<MemoryProfile> {
		const result = await Effect.tryPromise({
			try: () => this.client.profile({ containerTag }),
			catch: () => undefined,
		}).pipe(Effect.runPromise);

		if (result === undefined) return { facts: [], preferences: [], summary: "" };

		const staticFacts = result.profile.static.map(
			(content): MemoryBlock => ({
				content,
				source: `supermemory:${containerTag}`,
				type: "fact",
				updatedAt: new Date(),
			}),
		);

		const dynamicFacts = result.profile.dynamic.map(
			(content): MemoryBlock => ({
				content,
				source: `supermemory:${containerTag}`,
				type: mapType(content),
				updatedAt: new Date(),
			}),
		);

		const allBlocks = [...staticFacts, ...dynamicFacts];
		const facts = allBlocks.filter((b) => b.type === "fact");
		const preferences = allBlocks.filter((b) => b.type === "preference");

		const summaryParts = [...result.profile.static.slice(0, 5), ...result.profile.dynamic.slice(0, 5)];
		const summary = summaryParts.length > 0 ? `Key facts:\n${summaryParts.map((s) => `- ${s}`).join("\n")}` : "";

		return { facts, preferences, summary };
	}

	private async searchContainer(containerTag: string, query: string): Promise<ReadonlyArray<MemoryBlock>> {
		const result = await Effect.tryPromise({
			try: () =>
				this.client.search({
					q: query,
					containerTag,
					searchMode: "memories",
					limit: 10,
				}),
			catch: () => undefined,
		}).pipe(Effect.runPromise);

		if (result === undefined) return [];

		return result.results.map(
			(r): MemoryBlock => ({
				content: r.memory ?? r.chunk ?? "",
				source: typeof r.metadata?.source === "string" ? r.metadata.source : `supermemory:${containerTag}`,
				type: mapType(r.memory ?? r.chunk ?? ""),
				updatedAt: new Date(r.updatedAt ?? Date.now()),
			}),
		);
	}

	async loadProfile(): Promise<MemoryProfile> {
		const [userProfile, projectProfile] = await Promise.all([
			this.loadFromContainer(this.tags.userTag),
			this.loadFromContainer(this.tags.projectTag),
		]);

		return mergeProfiles(userProfile, projectProfile);
	}

	async recall(query: string): Promise<ReadonlyArray<MemoryBlock>> {
		const [userResults, projectResults] = await Promise.all([
			this.searchContainer(this.tags.userTag, query),
			this.searchContainer(this.tags.projectTag, query),
		]);

		return [...projectResults, ...userResults];
	}

	async save(content: string, type: MemoryType): Promise<void> {
		const containerTag = type === "preference" ? this.tags.userTag : this.tags.projectTag;
		const fallback = this.fallback;

		await Effect.tryPromise({
			try: () =>
				fetch("https://api.supermemory.ai/v4/memories", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.client.apiKey}`,
					},
					body: JSON.stringify({
						memories: [{ content, isStatic: type === "preference" }],
						containerTag,
					}),
				}).then((res) => {
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					return res.json();
				}),
			catch: () => undefined,
		}).pipe(Effect.runPromise);

		await fallback.save(content, type);
	}

	isAvailable(): boolean {
		return this.client !== undefined;
	}
}
