import type { Message } from "../llm/types.js";
import type { AgentState } from "../agent/state.js";

export interface ConversationStore {
  saveRun(state: AgentState): Promise<void>;
  getRun(runId: string): Promise<AgentState | undefined>;
  listRuns(): Promise<AgentState[]>;
}

export class InMemoryConversationStore implements ConversationStore {
  private runs = new Map<string, AgentState>();

  async saveRun(state: AgentState): Promise<void> {
    this.runs.set(state.runId, JSON.parse(JSON.stringify(state)));
  }

  async getRun(runId: string): Promise<AgentState | undefined> {
    const state = this.runs.get(runId);
    return state ? JSON.parse(JSON.stringify(state)) : undefined;
  }

  async listRuns(): Promise<AgentState[]> {
    return Array.from(this.runs.values()).map((s) => JSON.parse(JSON.stringify(s)));
  }
}

export interface MemoryFact {
  id: string;
  key: string;
  value: string;
  createdAt: Date;
}

export interface MemoryStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  search(query: string): Promise<MemoryFact[]>;
}

export class InMemoryMemoryStore implements MemoryStore {
  private facts = new Map<string, MemoryFact>();

  async set(key: string, value: string): Promise<void> {
    this.facts.set(key, {
      id: `fact_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      key,
      value,
      createdAt: new Date(),
    });
  }

  async get(key: string): Promise<string | undefined> {
    return this.facts.get(key)?.value;
  }

  async search(query: string): Promise<MemoryFact[]> {
    const q = query.toLowerCase();
    return Array.from(this.facts.values()).filter(
      (f) => f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
    );
  }
}
