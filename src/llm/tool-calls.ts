import { z } from "zod";
import type { ToolDefinition } from "../tools/types.js";
import type { ToolCallProposal } from "./types.js";

export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Converts internal ToolDefinition objects with Zod schemas into
 * OpenAI-compatible tool specifications for the API.
 */
export function toolDefinitionToOpenAITool(
  tool: ToolDefinition<any, any>
): OpenAIFunctionTool {
  // Use Zod's native toJSONSchema
  const rawSchema = (z as any).toJSONSchema
    ? (z as any).toJSONSchema(tool.inputSchema)
    : {};

  const jsonSchema = { ...rawSchema };
  delete jsonSchema["$schema"];

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
    },
  };
}

/**
 * Normalizes raw tool calls from OpenAI response into internal ToolCallProposal format.
 */
export function normalizeOpenAIToolCalls(
  rawCalls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>
): ToolCallProposal[] {
  if (!rawCalls || rawCalls.length === 0) return [];

  return rawCalls.map((call) => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(call.function.arguments || "{}");
    } catch {
      parsedArgs = { _raw: call.function.arguments };
    }

    return {
      id: call.id,
      name: call.function.name,
      arguments: parsedArgs,
    };
  });
}
