export enum MemoryType {
  Conversation = "Conversation",
  Working = "Working",
  Business = "Business",
  Semantic = "Semantic",
  Knowledge = "Knowledge"
}

export interface MemoryConfig {
  readonly enabled: boolean;
  readonly type: MemoryType;
  readonly maxTokens?: number;
}
