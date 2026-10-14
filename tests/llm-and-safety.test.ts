import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";
import { AgentOrchestrator } from "../src/agent/loop.js";
import { InMemoryApprovalManager, type ApprovalHandler } from "../src/safety/approval.js";
import { toolDefinitionToOpenAITool, normalizeOpenAIToolCalls } from "../src/llm/tool-calls.js";
import type { LLMClient, Message, LLMResponse } from "../src/llm/types.js";

describe("Tool Schemas & Conversion", () => {
  it("converts a Zod-based tool definition into OpenAI function calling format", () => {
    const tool = {
      name: "fetch_weather",
      description: "Get weather for a city",
      inputSchema: z.object({
        city: z.string().describe("The city name"),
        units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
      }),
      execute: async () => {},
    };

    const openAITool = toolDefinitionToOpenAITool(tool);

    expect(openAITool.type).toBe("function");
    expect(openAITool.function.name).toBe("fetch_weather");
    expect(openAITool.function.description).toBe("Get weather for a city");
    expect(openAITool.function.parameters).toHaveProperty("properties.city");
  });

  it("normalizes OpenAI raw tool calls into structured proposals", () => {
    const rawCalls = [
      {
        id: "call_abc123",
        type: "function",
        function: {
          name: "send_email",
          arguments: '{"to":"team@company.com","subject":"Release update"}',
        },
      },
    ];

    const normalized = normalizeOpenAIToolCalls(rawCalls);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.name).toBe("send_email");
    expect(normalized[0]?.arguments).toEqual({
      to: "team@company.com",
      subject: "Release update",
    });
  });
});

describe("Human Approval Gate", () => {
  it("pauses execution for approval on protected tools and blocks if rejected", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);
    const approvalManager = new InMemoryApprovalManager();

    // Sensitive tool requiring approval
    registry.register({
      name: "send_email",
      description: "Sends an email to user",
      requiresApproval: true,
      inputSchema: z.object({ to: z.string(), body: z.string() }),
      execute: async () => ({ sent: true }),
    });

    // Mock LLM proposes send_email on turn 1, then finishes
    const mockLLM: LLMClient = {
      async generate(messages: Message[]): Promise<LLMResponse> {
        const hasToolResult = messages.some((m) => m.role === "tool");
        if (!hasToolResult) {
          return {
            type: "tool_calls",
            toolCalls: [
              {
                id: "call_email_1",
                name: "send_email",
                arguments: { to: "ceo@company.com", body: "Important doc" },
              },
            ],
          };
        }
        return {
          type: "final_answer",
          content: "Email could not be sent because approval was rejected.",
        };
      },
    };

    // Rejection handler
    const rejectingApprovalHandler: ApprovalHandler = {
      requestApproval: vi.fn().mockResolvedValue(false),
    };

    const orchestrator = new AgentOrchestrator(
      { runId: "approval-test" },
      registry,
      executor,
      mockLLM,
      rejectingApprovalHandler,
      approvalManager
    );

    const state = await orchestrator.run({ task: "Send email to the CEO" });

    // Verify approval was requested
    expect(rejectingApprovalHandler.requestApproval).toHaveBeenCalled();
    // Tool execution result recorded as rejected
    expect(state.toolResults[0]?.ok).toBe(false);
    if (!state.toolResults[0]?.ok) {
      expect(state.toolResults[0]?.error.code).toBe("APPROVAL_REJECTED");
    }
    expect(state.status).toBe("completed");
    expect(state.finalAnswer).toContain("approval was rejected");
  });
});
