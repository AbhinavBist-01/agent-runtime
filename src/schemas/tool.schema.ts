import { z } from "zod";

export const ToolCallProposalSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

export type ToolCallProposal = z.infer<typeof ToolCallProposalSchema>;

export const ToolExecutionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const ToolExecutionResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    toolCallId: z.string(),
    data: z.unknown(),
  }),
  z.object({
    ok: z.literal(false),
    toolCallId: z.string(),
    error: ToolExecutionErrorSchema,
  }),
]);
