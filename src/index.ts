import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ToolRegistry } from "./tools/registry.js";
import { ToolExecutor } from "./tools/executor.js";
import { AgentOrchestrator } from "./agent/loop.js";
import { OpenAILLMClient } from "./llm/client.js";
import { InMemoryApprovalManager, type ApprovalHandler, type PendingApproval } from "./safety/approval.js";
import { createReadFileTool, createWriteFileTool } from "./tools/builtins/file-tools.js";
import { searchDocsTool } from "./tools/builtins/search-docs.js";
import { runCodeTool } from "./tools/builtins/run-code.js";
import { sendEmailTool } from "./tools/builtins/send-email.js";

// Re-export public API
export * from "./tools/types.js";
export * from "./tools/registry.js";
export * from "./tools/executor.js";
export * from "./tools/builtins/file-tools.js";
export * from "./tools/builtins/search-docs.js";
export * from "./tools/builtins/run-code.js";
export * from "./tools/builtins/send-email.js";
export {
  ToolCallProposalSchema,
  ToolExecutionErrorSchema,
  ToolExecutionResultSchema,
} from "./schemas/tool.schema.js";
export * from "./llm/types.js";
export * from "./llm/client.js";
export * from "./llm/tool-calls.js";
export * from "./agent/state.js";
export * from "./agent/loop.js";
export * from "./safety/approval.js";
export * from "./safety/permissions.js";
export * from "./reliability/timeout.js";
export * from "./reliability/retry.js";

/**
 * Interactive Terminal Approval Handler
 * Pauses the runtime and prompts the user on CLI when a protected tool is called.
 */
class ConsoleApprovalHandler implements ApprovalHandler {
  async requestApproval(approval: PendingApproval): Promise<boolean> {
    const rl = readline.createInterface({ input, output });
    console.log("\n=======================================================");
    console.log("⚠️  APPROVAL REQUIRED FOR PROTECTED ACTION");
    console.log(`Tool:      ${approval.toolCall.name}`);
    console.log(`Arguments: ${JSON.stringify(approval.toolCall.arguments, null, 2)}`);
    console.log("=======================================================");

    const answer = await rl.question("Approve this tool execution? [y/N]: ");
    rl.close();

    const approved = answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
    console.log(approved ? "✅ Execution approved." : "❌ Execution rejected by user.");
    return approved;
  }
}

/**
 * CLI Entry point for running the agent
 */
export async function main() {
  console.log("=======================================================");
  console.log("🚀 Agent Runtime: Guardrailed Autonomous LLM Orchestrator");
  console.log("=======================================================\n");

  const registry = new ToolRegistry();

  // Register built-in tools
  registry.register(createReadFileTool());
  registry.register(createWriteFileTool());
  registry.register(searchDocsTool);
  registry.register(runCodeTool);
  registry.register(sendEmailTool);

  const executor = new ToolExecutor(registry);
  const approvalManager = new InMemoryApprovalManager();
  const approvalHandler = new ConsoleApprovalHandler();

  // Pick LLM client (OpenAI or compatible endpoint)
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.log("💡 [Note]: OPENAI_API_KEY is not set in environment.");
    console.log("           To run live LLM requests, configure .env with OPENAI_API_KEY=sk-...\n");
    console.log("Registered Tools in Runtime:");
    registry.list().forEach((t) => {
      console.log(` - ${t.name}: ${t.description} (Approval: ${t.requiresApproval ? "Yes" : "No"})`);
    });
    return;
  }

  const llm = new OpenAILLMClient({ apiKey });

  const orchestrator = new AgentOrchestrator(
    {
      runId: `run_${Date.now()}`,
      systemPrompt: "You are a helpful assistant with access to safe tools. When asked to perform actions, choose appropriate tools.",
      permissions: ["fs:read", "fs:write", "code:execute", "email:send"],
      limits: { maxIterations: 8 },
    },
    registry,
    executor,
    llm,
    approvalHandler,
    approvalManager
  );

  const rl = readline.createInterface({ input, output });
  const task = await rl.question("Enter task for the agent: ");
  rl.close();

  if (!task.trim()) {
    console.log("No task entered. Exiting.");
    return;
  }

  console.log("\n⚡ Agent running...\n");
  const result = await orchestrator.run({ task });

  console.log("\n=================== EXECUTION SUMMARY ===================");
  console.log(`Status:     ${result.status}`);
  console.log(`Iterations: ${result.iteration}`);
  if (result.finalAnswer) {
    console.log(`Answer:     \n${result.finalAnswer}`);
  }
  if (result.error) {
    console.log(`Error:      ${result.error}`);
  }
}

import path from "node:path";
import { fileURLToPath } from "node:url";

// Auto-run if executed directly
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (executedFilePath && currentFilePath === executedFilePath) {
  main().catch((err) => {
    console.error("Runtime fatal error:", err);
    process.exit(1);
  });
}
