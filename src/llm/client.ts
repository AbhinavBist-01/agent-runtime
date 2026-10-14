import OpenAI from "openai";
import type { ToolDefinition } from "../tools/types.js";
import type { LLMClient, LLMResponse, Message } from "./types.js";
import {
  toolDefinitionToOpenAITool,
  normalizeOpenAIToolCalls,
} from "./tool-calls.js";

export interface OpenAIClientConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
}

export class OpenAILLMClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(config: OpenAIClientConfig = {}) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env["OPENAI_API_KEY"],
      baseURL: config.baseURL ?? process.env["OPENAI_BASE_URL"],
    });
    this.model = config.model ?? "gpt-4o-mini";
    this.temperature = config.temperature ?? 0.2;
  }

  public async generate(
    messages: Message[],
    tools: ToolDefinition<any, any>[],
  ): Promise<LLMResponse> {
    // 1. Format messages for OpenAI
    const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] =
      messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.toolCallId ?? "",
            content: m.content,
          };
        }

        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }

        return {
          role: m.role,
          content: m.content,
        };
      });

    // 2. Prepare payload
    const requestPayload: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.model,
      temperature: this.temperature,
      messages: openAIMessages,
    };

    if (tools.length > 0) {
      requestPayload.tools = tools.map((t) =>
        toolDefinitionToOpenAITool(t),
      ) as any;
    }

    // 3. Invoke API
    const response = await this.client.chat.completions.create(requestPayload);

    const choice = response.choices[0];
    if (!choice || !choice.message) {
      throw new Error("No response choice returned by LLM provider.");
    }

    const rawMessage = choice.message;

    // 4. Normalize response
    if (rawMessage.tool_calls && rawMessage.tool_calls.length > 0) {
      const functionCalls = rawMessage.tool_calls
        .filter(
          (
            tc,
          ): tc is typeof tc & {
            function: { name: string; arguments: string };
          } => "function" in tc && Boolean(tc.function),
        )
        .map((tc) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));

      const result: LLMResponse = {
        type: "tool_calls",
        toolCalls: normalizeOpenAIToolCalls(functionCalls),
      };
      if (rawMessage.content) {
        result.content = rawMessage.content;
      }
      return result;
    }

    return {
      type: "final_answer",
      content: rawMessage.content ?? "",
    };
  }
}
