import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";
import { AgentOrchestrator } from "../src/agent/loop.js";
import type { LLMClient, LLMResponse, Message } from "../src/llm/types.js";

/**
 * Scripted Mock LLM simulating the prompt flow:
 * Turn 1: Propose calling search_docs
 * Turn 2: Propose calling write_file
 * Turn 3: Return final answer
 */
class ScriptedMockLLM implements LLMClient {
  private callCount = 0;

  async generate(messages: Message[], tools: unknown[]): Promise<LLMResponse> {
    this.callCount++;

    if (this.callCount === 1) {
      return {
        type: "tool_calls",
        toolCalls: [
          {
            id: "call_search_1",
            name: "search_docs",
            arguments: { query: "Node.js streams" },
          },
        ],
      };
    }

    if (this.callCount === 2) {
      // LLM sees the observation in messages and proceeds to write
      return {
        type: "tool_calls",
        toolCalls: [
          {
            id: "call_write_1",
            name: "write_file",
            arguments: {
              path: "notes.md",
              content: "# Stream Summary\nNode streams are event emitters.",
            },
          },
        ],
      };
    }

    return {
      type: "final_answer",
      content: "I have gathered the Node.js documentation and written the summary to notes.md.",
    };
  }
}

describe("Milestone 1: Scripted Agent Execution", () => {
  it("executes full cycle: search_docs -> write_file -> final answer", async () => {
    const registry = new ToolRegistry();

    // 1. Fake tool: search_docs
    registry.register({
      name: "search_docs",
      description: "Search documentation",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => `Docs content for: ${query}`,
    });

    // 2. Fake tool: write_file
    const writtenFiles = new Map<string, string>();
    registry.register({
      name: "write_file",
      description: "Write content to a file",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        writtenFiles.set(path, content);
        return { bytesWritten: content.length };
      },
    });

    const executor = new ToolExecutor(registry);
    const mockLLM = new ScriptedMockLLM();

    const orchestrator = new AgentOrchestrator(
      { runId: "test-run-1" },
      registry,
      executor,
      mockLLM
    );

    const finalState = await orchestrator.run({
      task: "Find the latest Node.js documentation on streams and write summary to notes.md",
    });

    // Verify final state
    expect(finalState.status).toBe("completed");
    expect(finalState.finalAnswer).toBe(
      "I have gathered the Node.js documentation and written the summary to notes.md."
    );
    expect(finalState.iteration).toBe(3);

    // Verify side-effect execution
    expect(writtenFiles.has("notes.md")).toBe(true);
    expect(writtenFiles.get("notes.md")).toContain("Stream Summary");

    // Verify context history (User -> Assistant tool call -> Tool result -> Assistant tool call -> Tool result -> Final answer)
    expect(finalState.messages).toHaveLength(6);
    expect(finalState.messages[0]?.role).toBe("user");
    expect(finalState.messages[1]?.role).toBe("assistant");
    expect(finalState.messages[2]?.role).toBe("tool");
    expect(finalState.messages[3]?.role).toBe("assistant");
    expect(finalState.messages[4]?.role).toBe("tool");
    expect(finalState.messages[5]?.role).toBe("assistant");
  });

  it("stops and fails cleanly when exceeding maxIterations", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    // Infinite tool calling mock LLM
    const infiniteLoopLLM: LLMClient = {
      async generate() {
        return {
          type: "tool_calls",
          toolCalls: [{ id: "loop_call", name: "non_existent", arguments: {} }],
        };
      },
    };

    const orchestrator = new AgentOrchestrator(
      { runId: "loop-test", limits: { maxIterations: 3 } },
      registry,
      executor,
      infiniteLoopLLM
    );

    const finalState = await orchestrator.run({ task: "Loop forever" });
    expect(finalState.status).toBe("failed");
    expect(finalState.error).toContain("maximum allowed iterations");
  });
});
