import type { AssistantAction } from "../shared/contracts";

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmMessage {
  role: LlmRole;
  content: any;
  tool_call_id?: string;
  name?: string;
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
