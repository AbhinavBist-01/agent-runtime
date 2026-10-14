import type { Message } from "../llm/types.js";
import type { ToolExecutionResult } from "../tools/types.js";

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentLimits {
  maxIterations: number;
}

export interface AgentConfig {
  runId: string;
  systemPrompt?: string;
  permissions?: string[];
  limits?: Partial<AgentLimits>;
}

export interface AgentState {
  runId: string;
  status: AgentStatus;
  iteration: number;
  messages: Message[];
  toolResults: ToolExecutionResult[];
  finalAnswer?: string;
  error?: string;
}

export class StateManager {
  private state: AgentState;

  constructor(config: AgentConfig) {
    this.state = {
      runId: config.runId,
      status: "idle",
      iteration: 0,
      messages: config.systemPrompt
        ? [{ role: "system", content: config.systemPrompt }]
        : [],
      toolResults: [],
    };
  }

  public getState(): Readonly<AgentState> {
    return { ...this.state, messages: [...this.state.messages] };
  }

  public setStatus(status: AgentStatus): void {
    this.state.status = status;
  }

  public incrementIteration(): number {
    this.state.iteration += 1;
    return this.state.iteration;
  }

  public addMessage(message: Message): void {
    this.state.messages.push(message);
  }

  public addToolResult(result: ToolExecutionResult): void {
    this.state.toolResults.push(result);
  }

  public complete(finalAnswer: string): void {
    this.state.status = "completed";
    this.state.finalAnswer = finalAnswer;
  }

  public fail(errorMessage: string): void {
    this.state.status = "failed";
    this.state.error = errorMessage;
  }
}
