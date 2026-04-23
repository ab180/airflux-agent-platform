export interface PromptVersion {
  id: number;
  agent: string;
  version: string;
  content: string;
  description: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface PromptStore {
  listVersions(agent: string): PromptVersion[];
  getCurrent(agent: string): PromptVersion | null;
  saveVersion(input: Omit<PromptVersion, 'id' | 'createdAt'>): PromptVersion;
  setCurrent(agent: string, versionId: number): void;
}
