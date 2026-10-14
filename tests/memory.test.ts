import { describe, it, expect } from "vitest";
import { InMemoryConversationStore, InMemoryMemoryStore } from "../src/memory/memory.js";
import { AgentOrchestrator } from "../src/agent/loop.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";
import type { LLMClient } from "../src/llm/types.js";

describe("Memory and Persistence", () => {
  it("persists run state into ConversationStore upon completion", async () => {
    const store = new InMemoryConversationStore();
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const mockLLM: LLMClient = {
      async generate() {
        return {
          type: "final_answer",
          content: "Done and remembered.",
        };
      },
    };

    const orchestrator = new AgentOrchestrator(
      { runId: "persist-run-42" },
      registry,
      executor,
      mockLLM,
      undefined,
      undefined,
      store
    );

    const state = await orchestrator.run({ task: "Remember this run" });
    expect(state.status).toBe("completed");

    const retrieved = await store.getRun("persist-run-42");
    expect(retrieved).toBeDefined();
    expect(retrieved?.finalAnswer).toBe("Done and remembered.");
    expect(retrieved?.messages[0]?.content).toBe("Remember this run");
  });

  it("stores and retrieves facts using MemoryStore", async () => {
    const memory = new InMemoryMemoryStore();

    await memory.set("user_preference", "Prefers concise TypeScript code without any comments.");
    await memory.set("project_name", "Guardrailed Agent Runtime");

    const pref = await memory.get("user_preference");
    expect(pref).toContain("TypeScript");

    const searchResults = await memory.search("agent");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.value).toBe("Guardrailed Agent Runtime");
  });
});
