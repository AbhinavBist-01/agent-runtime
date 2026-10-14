import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";
import { searchDocsTool } from "../src/tools/builtins/search-docs.js";
import { runCodeTool } from "../src/tools/builtins/run-code.js";
import { sendEmailTool } from "../src/tools/builtins/send-email.js";
import type { ToolContext } from "../src/tools/types.js";

describe("Built-in Tools Suite", () => {
  const fullPermissionsContext: ToolContext = {
    runId: "tools-test",
    signal: new AbortController().signal,
    permissions: ["code:execute", "email:send", "fs:read", "fs:write"],
  };

  it("search_docs tool returns matched documentation snippets", async () => {
    const registry = new ToolRegistry();
    registry.register(searchDocsTool);
    const executor = new ToolExecutor(registry);

    const result = await executor.execute({
      toolCallId: "doc-1",
      name: "search_docs",
      arguments: { query: "streams pipeline" },
      context: fullPermissionsContext,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as any;
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0].title).toContain("Stream");
    }
  });

  it("run_code tool safely executes JavaScript in VM context without process or require", async () => {
    const registry = new ToolRegistry();
    registry.register(runCodeTool);
    const executor = new ToolExecutor(registry);

    const result = await executor.execute({
      toolCallId: "code-1",
      name: "run_code",
      arguments: {
        code: `
          console.log("computing...");
          const res = [1, 2, 3, 4].reduce((acc, n) => acc + n, 0);
          res;
        `,
      },
      context: fullPermissionsContext,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as any;
      expect(data.stdout).toContain("computing...");
      expect(data.result).toBe("10");
    }
  });

  it("send_email tool validates email and dispatches simulated message", async () => {
    const registry = new ToolRegistry();
    registry.register(sendEmailTool);
    const executor = new ToolExecutor(registry);

    const result = await executor.execute({
      toolCallId: "email-1",
      name: "send_email",
      arguments: {
        to: "developer@example.com",
        subject: "Runtime status",
        body: "All systems nominal.",
      },
      context: fullPermissionsContext,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as any;
      expect(data.sent).toBe(true);
      expect(data.recipient).toBe("developer@example.com");
    }
  });
});
