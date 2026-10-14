import { z } from "zod";
import type { ToolDefinition } from "../types.js";

/**
 * Built-in safe email tool.
 * Requires email:send permission and approval before dispatching.
 */
export const sendEmailTool: ToolDefinition<
  { to: string; subject: string; body: string },
  { sent: boolean; messageId: string; recipient: string }
> = {
  name: "send_email",
  description: "Dispatches an email notification. Strictly requires approval and authorization.",
  requiresApproval: true,
  requiredPermissions: ["email:send"],
  inputSchema: z.object({
    to: z.string().email().describe("Recipient email address"),
    subject: z.string().min(1).describe("Email subject line"),
    body: z.string().describe("Email body content"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.string(),
    recipient: z.string(),
  }),
  timeoutMs: 4000,
  execute: async ({ to, subject, body }) => {
    // Simulated safe email sender
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      sent: true,
      messageId,
      recipient: to,
    };
  },
};
