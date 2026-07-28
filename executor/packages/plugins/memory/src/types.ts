export type MemoryType = "fact" | "preference" | "decision" | "event";

export interface MemoryBlock {
	readonly content: string;
	readonly source: string;
	readonly type: MemoryType;
	readonly updatedAt: Date;
}

export interface MemoryProfile {
	readonly facts: ReadonlyArray<MemoryBlock>;
	readonly preferences: ReadonlyArray<MemoryBlock>;
	readonly summary: string;
}

export interface MemoryService {
	readonly loadProfile: () => Promise<MemoryProfile>;
	readonly recall: (query: string) => Promise<ReadonlyArray<MemoryBlock>>;
	readonly save: (content: string, type: MemoryType) => Promise<void>;
	readonly isAvailable: () => boolean;
}
