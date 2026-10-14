import type { ToolRegistry } from "./registry.js";
import type { ToolContext, ToolExecutionResult } from "./types.js";

export interface ExecutorOptions {
  toolCallId: string;
  name: string;
  arguments: unknown;
  context: ToolContext;
}

export class ToolExecutor {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  public async execute(options: ExecutorOptions): Promise<ToolExecutionResult> {
    const { toolCallId, name, arguments: rawArgs, context } = options;

    const tool = this.toolRegistry.get(name);
    if (!tool) {
      return {
        ok: false,
        toolCallId,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool "${name}" is not registered.`,
          retryable: false,
        },
      };
    }

    // 1. Guardrail: Permission check
    if (tool.requiredPermissions && tool.requiredPermissions.length > 0) {
      const missing = tool.requiredPermissions.filter(
        (perm) => !context.permissions.includes(perm)
      );
      if (missing.length > 0) {
        return {
          ok: false,
          toolCallId,
          error: {
            code: "PERMISSION_DENIED",
            message: `Execution of "${name}" requires missing permissions: ${missing.join(", ")}`,
            retryable: false,
          },
        };
      }
    }

    // 2. Guardrail: Schema validation via Zod
    const parsed = tool.inputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        toolCallId,
        error: {
          code: "INVALID_ARGUMENTS",
          message: `Argument validation failed for "${name}": ${parsed.error.message}`,
          retryable: true,
        },
      };
    }

    // 3. Guardrail: Check cancellation signal
    if (context.signal.aborted) {
      return {
        ok: false,
        toolCallId,
        error: {
          code: "ABORTED",
          message: "Operation was aborted before execution started.",
          retryable: false,
        },
      };
    }

    // 4. Safe Execution Boundary
    try {
      const data = await tool.execute(parsed.data, context);

      // Optional output contract validation
      if (tool.outputSchema) {
        const parsedOutput = tool.outputSchema.safeParse(data);
        if (!parsedOutput.success) {
          return {
            ok: false,
            toolCallId,
            error: {
              code: "MALFORMED_OUTPUT",
              message: `Tool "${name}" produced output that did not match output contract: ${parsedOutput.error.message}`,
              retryable: false,
            },
          };
        }
      }

      return {
        ok: true,
        toolCallId,
        data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        toolCallId,
        error: {
          code: "EXECUTION_ERROR",
          message,
          retryable: true,
        },
      };
    }
  }
}
