export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCallProposal {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallProposal[];
}

export type LLMResponse =
  | {
      type: "tool_calls";
      toolCalls: ToolCallProposal[];
      content?: string;
    }
  | {
      type: "final_answer";
      content: string;
    };

export interface StreamOptions {
  onChunk?: (chunk: string) => void;
}

export interface LLMClient {
  generate(
    messages: Message[],
    tools: unknown[],
    options?: StreamOptions
  ): Promise<LLMResponse>;
}
