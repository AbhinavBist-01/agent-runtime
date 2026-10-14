import type { ToolDefinition } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any, any>>();

  public register<TInput, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
  ): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  public list(): ToolDefinition<any, any>[] {
    return Array.from(this.tools.values());
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }
}
