import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";
import type { ToolDefinition, ToolContext } from "../src/tools/types.js";

describe("ToolRegistry", () => {
  it("registers a tool and retrieves it by name", () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition<{ q: string }, string> = {
      name: "search",
      description: "Search documents",
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => `Results for ${q}`,
    };

    registry.register(tool);
    expect(registry.has("search")).toBe(true);
    expect(registry.get("search")).toBe(tool);
    expect(registry.list()).toHaveLength(1);
  });

  it("throws error when registering duplicate tool names", () => {
    const registry = new ToolRegistry();
    const tool1: ToolDefinition<any, any> = {
      name: "read_file",
      description: "Reads file",
      inputSchema: z.object({}),
      execute: async () => "",
    };
    const tool2: ToolDefinition<any, any> = {
      name: "read_file",
      description: "Duplicate",
      inputSchema: z.object({}),
      execute: async () => "",
    };

    registry.register(tool1);
    expect(() => registry.register(tool2)).toThrow(/already registered/);
  });
});

describe("ToolExecutor", () => {
  const defaultContext: ToolContext = {
    runId: "run-123",
    signal: new AbortController().signal,
    permissions: ["fs:read", "fs:write"],
  };

  it("returns TOOL_NOT_FOUND when tool is missing", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const result = await executor.execute({
      toolCallId: "call-1",
      name: "unknown_tool",
      arguments: {},
      context: defaultContext,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_NOT_FOUND");
    }
  });

  it("enforces permission guardrails", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "send_email",
      description: "Sends email",
      requiredPermissions: ["email:send"],
      inputSchema: z.object({ to: z.string() }),
      execute: async () => "sent",
    });

    const executor = new ToolExecutor(registry);
    const result = await executor.execute({
      toolCallId: "call-2",
      name: "send_email",
      arguments: { to: "test@example.com" },
      context: defaultContext, // Missing email:send
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("rejects invalid arguments via Zod", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "calculate",
      description: "Multiply numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => a * b,
    });

    const executor = new ToolExecutor(registry);
    const result = await executor.execute({
      toolCallId: "call-3",
      name: "calculate",
      arguments: { a: "not a number", b: 10 },
      context: defaultContext,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENTS");
    }
  });

  it("successfully executes valid tool and returns structured result", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "calculate",
      description: "Multiply numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => a * b,
    });

    const executor = new ToolExecutor(registry);
    const result = await executor.execute({
      toolCallId: "call-4",
      name: "calculate",
      arguments: { a: 5, b: 6 },
      context: defaultContext,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(30);
    }
  });
});
