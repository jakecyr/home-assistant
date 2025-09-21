import type {
  LlmMessage,
  LlmPort,
  StructuredCompletion,
  StructuredOptions,
} from "../../app/LlmPort";
import type { AssistantAction } from "../../shared/contracts";
import { OPENAI_TEXT_MODEL } from "../../env";
import { getOpenAI } from "../../openai";
import type { ChatCompletionMessageParam } from "openai/resources";

function toChatMessage(msg: LlmMessage): ChatCompletionMessageParam {
  const base: ChatCompletionMessageParam = {
    role: msg.role,
    content: msg.content,
  } as ChatCompletionMessageParam;

  if (msg.role === "tool" && msg.tool_call_id) {
    (base as any).tool_call_id = msg.tool_call_id;
  }
  if (msg.role === "assistant" && Array.isArray(msg.content)) {
    base.content = msg.content as any;
  }
  return base;
}

function normalizeAssistantMessage(raw: any): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (typeof part.text === "string") return part.text;
        if (typeof part.data === "string") return part.data;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("")
      .trim();
  }
  if (raw && typeof raw === "object" && typeof raw.text === "string") {
    return raw.text.trim();
  }
  return "";
}

function parseAssistantAction(content: string): AssistantAction {
  try {
    return JSON.parse(content) as AssistantAction;
  } catch (err) {
    throw new Error(`Failed to parse assistant JSON action: ${(err as Error).message}`);
  }
}

export class OpenAiLlmAdapter implements LlmPort {
  async completeStructured(
    messages: LlmMessage[],
    tools: any[],
    options: StructuredOptions
  ): Promise<StructuredCompletion> {
    const client = getOpenAI();
    const requestMessages = messages.map(toChatMessage);

    const resp = await client.chat.completions.create({
      model: OPENAI_TEXT_MODEL,
      messages: requestMessages,
      tools,
      tool_choice: options.toolChoice ?? "none",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.responseFormat.name,
          schema: options.responseFormat.schema,
          strict: true,
        },
      },
    });

    const assistantMessage = resp.choices?.[0]?.message;
    if (!assistantMessage) {
      throw new Error("LLM returned no assistant message.");
    }

    const content = normalizeAssistantMessage(assistantMessage.content);
    if (!content) {
      throw new Error("Assistant response was empty.");
    }

    const action = parseAssistantAction(content);

    return {
      action,
      assistantMessage: {
        role: assistantMessage.role || "assistant",
        content,
      },
    };
  }
}
