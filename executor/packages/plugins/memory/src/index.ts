import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { FilesystemAdapter } from "./filesystem";
import { SupermemoryAdapter } from "./supermemory";
import type { MemoryService } from "./types";

function getSupermemoryApiKey(): string | undefined {
	if (process.env.HARNESSY_SUPERMEMORY === "0") {
		return undefined;
	}

	const envKey = process.env.SUPERMEMORY_API_KEY;
	if (envKey) {
		return envKey;
	}

	const authPath = join(homedir(), ".hsy", "agent", "auth.json");
	if (!existsSync(authPath)) {
		return undefined;
	}

	// oxlint-disable-next-line executor/no-try-catch-or-throw -- boundary: file parse for API key
	try {
		const auth = JSON.parse(readFileSync(authPath, "utf8"));
		if (auth.supermemory?.type === "api_key" && typeof auth.supermemory.key === "string") {
			return auth.supermemory.key;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function sanitizeContainerName(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

export function createMemoryService(projectRoot: string): MemoryService {
	const apiKey = getSupermemoryApiKey();
	if (apiKey) {
		const projectName = sanitizeContainerName(basename(projectRoot));
	return new SupermemoryAdapter(
		apiKey,
		{
			userTag: "harnessy:user",
			projectTag: `harnessy:project:${projectName}`,
		},
		projectRoot,
	);
	}
	return new FilesystemAdapter(projectRoot);
}

export type { MemoryBlock, MemoryProfile, MemoryService, MemoryType } from "./types.ts";
