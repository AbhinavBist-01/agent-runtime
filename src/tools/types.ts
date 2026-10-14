import { z } from "zod";

export interface ToolContext {
  runId: string;
  signal: AbortSignal;
  permissions: string[];
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
  requiresApproval?: boolean;
  requiredPermissions?: string[];
}

export interface ToolExecutionError {
  code: string;
  message: string;
  retryable: boolean;
}

export type ToolExecutionResult<TOutput = unknown> =
  | {
      ok: true;
      toolCallId: string;
      data: TOutput;
    }
  | {
      ok: false;
      toolCallId: string;
      error: ToolExecutionError;
    };
