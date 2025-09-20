export type JSONSchema = {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface ToolContext {
  // Add anything your tools might need: config, loggers, GPIO, HTTP clients, etc.
  log: (...args: any[]) => void;
}

export interface ToolResult {
  ok: boolean;
  message?: string;
  data?: any;
}

export interface Tool {
  name: string; // unique
  description: string;
  parameters: JSONSchema; // JSON Schema for arguments
  execute: (args: any, ctx: ToolContext) => Promise<ToolResult>;
}

// OpenAI "function tool" spec (Responses API)
export type OpenAIToolSpec = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: any; // JSON Schema
  };
};

export function toOpenAIToolSpec(t: Tool): OpenAIToolSpec {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}
