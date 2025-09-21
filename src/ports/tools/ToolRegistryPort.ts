export interface ToolExecutionResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: any;
}

export interface ToolRegistryPort {
  list(): ToolDefinition[];
  exec(name: string, args: any): Promise<ToolExecutionResult>;
}
