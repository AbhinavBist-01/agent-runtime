import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";
import { withTimeout } from "../src/reliability/timeout.js";
import { withRetry } from "../src/reliability/retry.js";
import { createReadFileTool, createWriteFileTool } from "../src/tools/builtins/file-tools.js";
import type { ToolContext } from "../src/tools/types.js";

describe("Reliability: Timeout and Retry", () => {
  it("times out if operation takes longer than timeoutMs", async () => {
    await expect(
      withTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
        { timeoutMs: 50, operationName: "SlowOp" }
      )
    ).rejects.toThrow(/timed out after 50ms/);
  });

  it("retries transient failures up to maxAttempts", async () => {
    let attempts = 0;
    const result = await withRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt < 3) throw new Error("Transient network glitch");
        return "success";
      },
      { maxAttempts: 3, initialDelayMs: 10 }
    );

    expect(attempts).toBe(3);
    expect(result).toBe("success");
  });

  it("executor enforces tool-level timeoutMs", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "hanging_tool",
      description: "tool that hangs",
      inputSchema: z.object({}),
      timeoutMs: 50,
      execute: async () => new Promise((resolve) => setTimeout(resolve, 300)),
    });

    const executor = new ToolExecutor(registry);
    const result = await executor.execute({
      toolCallId: "hang-1",
      name: "hanging_tool",
      arguments: {},
      context: {
        runId: "r1",
        signal: new AbortController().signal,
        permissions: [],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TIMEOUT");
    }
  });
});

describe("Safe File Builtins & Path Traversal Guardrail", () => {
  let tempDir: string;
  let testContext: ToolContext;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-"));
    testContext = {
      runId: "sandbox-run",
      signal: new AbortController().signal,
      permissions: ["fs:read", "fs:write"],
    };
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("safely writes and reads files within sandboxed directory", async () => {
    const registry = new ToolRegistry();
    registry.register(createWriteFileTool(tempDir));
    registry.register(createReadFileTool(tempDir));

    const executor = new ToolExecutor(registry);

    // 1. Write file
    const writeRes = await executor.execute({
      toolCallId: "write-1",
      name: "write_file",
      arguments: { path: "hello.txt", content: "Agent Runtime safe content" },
      context: testContext,
    });

    expect(writeRes.ok).toBe(true);

    // 2. Read file
    const readRes = await executor.execute({
      toolCallId: "read-1",
      name: "read_file",
      arguments: { path: "hello.txt" },
      context: testContext,
    });

    expect(readRes.ok).toBe(true);
    if (readRes.ok) {
      expect((readRes.data as any).content).toBe("Agent Runtime safe content");
    }
  });

  it("blocks path traversal attacks attempting to escape sandbox directory", async () => {
    const registry = new ToolRegistry();
    registry.register(createReadFileTool(tempDir));

    const executor = new ToolExecutor(registry);

    const traversalRes = await executor.execute({
      toolCallId: "traversal-1",
      name: "read_file",
      arguments: { path: "../../secret.txt" },
      context: testContext,
    });

    expect(traversalRes.ok).toBe(false);
    if (!traversalRes.ok) {
      expect(traversalRes.error.message).toContain("outside the allowed directory");
    }
  });
});
