import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { MemoryBlock, MemoryProfile, MemoryService, MemoryType } from "./types";

const MEMORY_FILES = ["org.md", "project.md", "decisions.md", "events.md"] as const;

const FILE_TYPE_MAP: Record<string, MemoryType> = {
	"org.md": "preference",
	"project.md": "fact",
	"decisions.md": "decision",
	"events.md": "event",
};

function parseMarkdownSections(content: string, source: string, type: MemoryType): ReadonlyArray<MemoryBlock> {
	const lines = content.split("\n");
	const blocks: MemoryBlock[] = [];
	let currentSection = "";
	let currentContent: string[] = [];

	for (const line of lines) {
		if (line.startsWith("# ")) {
			continue;
		}

		if (line.startsWith("## ")) {
			if (currentSection && currentContent.length > 0) {
				blocks.push({
					content: `${currentSection}\n${currentContent.join("\n")}`.trim(),
					source,
					type,
					updatedAt: statSync(source).mtime,
				});
			}
			currentSection = line.slice(3).trim();
			currentContent = [];
		} else if (currentSection) {
			currentContent.push(line);
		}
	}

	if (currentSection && currentContent.length > 0) {
		blocks.push({
			content: `${currentSection}\n${currentContent.join("\n")}`.trim(),
			source,
			type,
			updatedAt: statSync(source).mtime,
		});
	}

	return blocks;
}

function buildSummary(blocks: ReadonlyArray<MemoryBlock>): string {
	const maxBlocks = 10;
	const selected = blocks.slice(0, maxBlocks);
	if (selected.length === 0) {
		return "";
	}

	const lines = selected.map((b) => `- ${b.content.split("\n")[0]}`);
	return `Key facts from memory:\n${lines.join("\n")}`;
}

export class FilesystemAdapter implements MemoryService {
	private readonly memoryDir: string;

	constructor(projectRoot: string) {
		this.memoryDir = join(projectRoot, ".harnessy", "memory");
	}

	async loadProfile(): Promise<MemoryProfile> {
		const allBlocks: MemoryBlock[] = [];

		for (const file of MEMORY_FILES) {
			const filePath = join(this.memoryDir, file);
			if (!existsSync(filePath)) {
				continue;
			}

			const content = readFileSync(filePath, "utf8");
			const type = FILE_TYPE_MAP[file] ?? "fact";
			const blocks = parseMarkdownSections(content, filePath, type);
			allBlocks.push(...blocks);
		}

		const facts = allBlocks.filter((b) => b.type === "fact");
		const preferences = allBlocks.filter((b) => b.type === "preference");

		return {
			facts,
			preferences,
			summary: buildSummary(allBlocks),
		};
	}

	async recall(query: string): Promise<ReadonlyArray<MemoryBlock>> {
		const profile = await this.loadProfile();
		const allBlocks = [...profile.facts, ...profile.preferences];
		const queryLower = query.toLowerCase();

		return allBlocks.filter(
			(b) => b.content.toLowerCase().includes(queryLower) || b.source.toLowerCase().includes(queryLower),
		);
	}

	async save(content: string, type: MemoryType): Promise<void> {
		const fileMap: Record<MemoryType, string> = {
			fact: "project.md",
			preference: "org.md",
			decision: "decisions.md",
			event: "events.md",
		};

		const fileName = fileMap[type];
		const filePath = join(this.memoryDir, fileName);
		const timestamp = new Date().toISOString().split("T")[0];

		const entry = `\n## ${timestamp}\n${content}\n`;

		if (!existsSync(this.memoryDir)) {
			return;
		}

		appendFileSync(filePath, entry, "utf8");
	}

	isAvailable(): boolean {
		return existsSync(this.memoryDir);
	}
}
