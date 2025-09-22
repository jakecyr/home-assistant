import type { AssistantAction } from "../shared/contracts";

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmMessage {
  role: LlmRole;
  content: any;
  tool_call_id?: string;
  name?: string;
  // When role === "assistant", OpenAI expects tool call metadata to precede any
  // subsequent messages with role "tool". We include this optional field so the
  // orchestrator can synthesize an assistant message that declares tool calls.
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: any;
}

export interface LlmResponse {
  messages: LlmMessage[];
  toolCalls?: LlmToolCall[];
}

export interface StructuredCompletion {
  action: AssistantAction;
  assistantMessage: LlmMessage;
}

export interface StructuredOptions {
  responseFormat: {
    name: string;
    schema: any;
  };
  toolChoice?: "none" | "auto";
}

export interface LlmPort {
  completeStructured(
    messages: LlmMessage[],
    tools: any[],
    options: StructuredOptions
  ): Promise<StructuredCompletion>;
}
