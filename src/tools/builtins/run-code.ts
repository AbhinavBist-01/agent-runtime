import vm from "node:vm";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";

/**
 * Sandboxed code runner.
 * Uses Node's isolated vm Context with a strict timeout and restricted global scope.
 * Requires code:execute permission and human approval by default.
 */
export const runCodeTool: ToolDefinition<
  { code: string },
  { stdout: string; result: string; executionTimeMs: number }
> = {
  name: "run_code",
  description: "Runs JavaScript code in a sandboxed, restricted environment without filesystem or network access.",
  requiresApproval: true,
  requiredPermissions: ["code:execute"],
  inputSchema: z.object({
    code: z.string().describe("JavaScript code to execute"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    result: z.string(),
    executionTimeMs: z.number(),
  }),
  timeoutMs: 3000,
  execute: async ({ code }) => {
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => logs.push("[ERROR] " + args.map(String).join(" ")),
        warn: (...args: unknown[]) => logs.push("[WARN] " + args.map(String).join(" ")),
      },
      Math,
      Date,
      JSON,
      parseInt,
      parseFloat,
      Buffer: undefined,
      process: undefined,
      require: undefined,
    };

    const context = vm.createContext(sandbox);
    const script = new vm.Script(code);

    const startTime = Date.now();
    const evaluated = script.runInContext(context, {
      timeout: 2000,
    });
    const executionTimeMs = Date.now() - startTime;

    return {
      stdout: logs.join("\n"),
      result: evaluated !== undefined ? String(evaluated) : "undefined",
      executionTimeMs,
    };
  },
};
