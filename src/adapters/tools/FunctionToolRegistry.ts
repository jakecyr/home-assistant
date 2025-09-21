import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolRegistryPort,
} from "../../ports/tools/ToolRegistryPort";

export interface FunctionTool {
  name: string;
  description: string;
  schema: any;
  exec: (args: any) => Promise<ToolExecutionResult> | ToolExecutionResult;
}

export class FunctionToolRegistry implements ToolRegistryPort {
  private readonly toolsByName = new Map<string, FunctionTool>();

  constructor(tools: FunctionTool[]) {
    for (const tool of tools) {
      this.toolsByName.set(tool.name, tool);
    }
  }

  list(): ToolDefinition[] {
    return Array.from(this.toolsByName.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
    }));
  }

  async exec(name: string, args: any): Promise<ToolExecutionResult> {
    const tool = this.toolsByName.get(name);
    if (!tool) {
      return {
        ok: false,
        message: `Tool "${name}" is not registered.`,
      };
    }

    try {
      return await tool.exec(args);
    } catch (err) {
      return {
        ok: false,
        message: `Tool "${name}" failed: ${(err as Error).message}`,
      };
    }
  }
}
