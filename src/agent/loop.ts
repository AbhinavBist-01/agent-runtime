import { StateManager, type AgentConfig, type AgentState } from "./state.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolExecutor } from "../tools/executor.js";
import type { LLMClient } from "../llm/types.js";
import type { ToolContext, ToolExecutionResult } from "../tools/types.js";
import type { ApprovalHandler, InMemoryApprovalManager } from "../safety/approval.js";

export interface AgentRunOptions {
  task: string;
  signal?: AbortSignal;
}

export class AgentOrchestrator {
  private readonly maxIterations: number;
  private readonly permissions: string[];

  constructor(
    private readonly config: AgentConfig,
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly llm: LLMClient,
    private readonly approvalHandler?: ApprovalHandler,
    private readonly approvalManager?: InMemoryApprovalManager
  ) {
    this.maxIterations = config.limits?.maxIterations ?? 10;
    this.permissions = config.permissions ?? [];
  }

  public async run(options: AgentRunOptions): Promise<AgentState> {
    const abortController = new AbortController();
    const signal = options.signal ?? abortController.signal;

    const stateManager = new StateManager(this.config);
    stateManager.setStatus("running");

    // Add user prompt to message history
    stateManager.addMessage({
      role: "user",
      content: options.task,
    });

    const context: ToolContext = {
      runId: this.config.runId,
      signal,
      permissions: this.permissions,
    };

    while (stateManager.getState().status === "running") {
      const currentIteration = stateManager.incrementIteration();

      // Guardrail: Max iterations exceeded
      if (currentIteration > this.maxIterations) {
        stateManager.fail(`Reached maximum allowed iterations (${this.maxIterations}).`);
        break;
      }

      // Guardrail: Cancellation check
      if (signal.aborted) {
        stateManager.fail("Execution was aborted.");
        break;
      }

      // Step 1: Think / Decide - Call LLM
      const tools = this.registry.list();
      const messages = stateManager.getState().messages;

      const response = await this.llm.generate(messages, tools);

      // Step 2: Handle LLM Decision
      if (response.type === "final_answer") {
        stateManager.addMessage({
          role: "assistant",
          content: response.content,
        });
        stateManager.complete(response.content);
        break;
      }

      if (response.type === "tool_calls") {
        // Record assistant's decision to call tools
        stateManager.addMessage({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls,
        });

        // Step 3: Act - Execute each proposed tool
        for (const toolCall of response.toolCalls) {
          const toolDef = this.registry.get(toolCall.name);

          // Guardrail: Human Approval Check for protected tools
          if (toolDef?.requiresApproval) {
            let approved = false;
            if (this.approvalHandler && this.approvalManager) {
              const pendingApproval = this.approvalManager.createApproval(
                this.config.runId,
                toolCall
              );
              approved = await this.approvalHandler.requestApproval(pendingApproval);
              this.approvalManager.decide(
                pendingApproval.id,
                approved ? "approved" : "rejected"
              );
            }

            if (!approved) {
              const rejectionResult: ToolExecutionResult = {
                ok: false,
                toolCallId: toolCall.id,
                error: {
                  code: "APPROVAL_REJECTED",
                  message: `User rejected approval for tool execution "${toolCall.name}".`,
                  retryable: false,
                },
              };

              stateManager.addToolResult(rejectionResult);
              stateManager.addMessage({
                role: "tool",
                toolCallId: toolCall.id,
                content: `Error [APPROVAL_REJECTED]: Execution rejected by user.`,
              });
              continue;
            }
          }

          const result = await this.executor.execute({
            toolCallId: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            context,
          });

          stateManager.addToolResult(result);

          // Step 4: Observe - Feed tool result back to agent's context
          stateManager.addMessage({
            role: "tool",
            toolCallId: result.toolCallId,
            content: result.ok
              ? typeof result.data === "string"
                ? result.data
                : JSON.stringify(result.data)
              : `Error [${result.error.code}]: ${result.error.message}`,
          });
        }
      }
    }

    return stateManager.getState();
  }
}
