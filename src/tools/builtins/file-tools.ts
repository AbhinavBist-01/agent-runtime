import fs from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { resolveSafePath } from "../../safety/permissions.js";

export function createReadFileTool(allowedBaseDir: string = process.cwd()): ToolDefinition<
  { path: string },
  { content: string; path: string }
> {
  return {
    name: "read_file",
    description: "Safely reads the content of a text file within permitted directories.",
    requiredPermissions: ["fs:read"],
    inputSchema: z.object({
      path: z.string().describe("Relative or safe path to file to read"),
    }),
    outputSchema: z.object({
      content: z.string(),
      path: z.string(),
    }),
    timeoutMs: 5000,
    execute: async ({ path: filePath }) => {
      const safePath = resolveSafePath(filePath, allowedBaseDir);
      const content = await fs.readFile(safePath, "utf-8");
      return { content, path: filePath };
    },
  };
}

export function createWriteFileTool(allowedBaseDir: string = process.cwd()): ToolDefinition<
  { path: string; content: string },
  { success: boolean; bytesWritten: number; path: string }
> {
  return {
    name: "write_file",
    description: "Safely writes content to a file within permitted directories. Requires approval.",
    requiresApproval: true,
    requiredPermissions: ["fs:write"],
    inputSchema: z.object({
      path: z.string().describe("Target file path"),
      content: z.string().describe("Content to write"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      bytesWritten: z.number(),
      path: z.string(),
    }),
    timeoutMs: 5000,
    execute: async ({ path: filePath, content }) => {
      const safePath = resolveSafePath(filePath, allowedBaseDir);
      await fs.writeFile(safePath, content, "utf-8");
      return {
        success: true,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
        path: filePath,
      };
    },
  };
}
