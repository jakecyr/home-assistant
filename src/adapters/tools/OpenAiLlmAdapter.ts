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
  if (msg.role === "assistant" && Array.isArray((msg as any).tool_calls)) {
    // Pass through assistant tool_calls so that any following 'tool' messages
    // are properly associated per OpenAI API contract.
    (base as any).tool_calls = (msg as any).tool_calls;
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

    try {
      const debug = requestMessages.map((m: any) => {
        const copy: any = { role: m.role };
        if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
          copy.tool_calls = m.tool_calls.map((t: any) => ({
            id: t.id,
            function: { name: t.function?.name },
          }));
        }
        if (m.role === "assistant") {
          if (typeof m.content === "string" && m.content.length) {
            copy.preview = m.content.slice(0, 80);
          } else if (Array.isArray(m.content)) {
            const textPart = m.content.find((part: any) => typeof part?.text === "string");
            if (textPart?.text) {
              copy.preview = textPart.text.slice(0, 80);
            }
          }
        }
        if (m.role === "tool") {
          copy.tool_call_id = m.tool_call_id;
          copy.name = m.name;
          if (typeof m.content === "string") {
            copy.preview = m.content.slice(0, 80);
          }
        }
        if (m.role === "system" || m.role === "user") {
          copy.preview = typeof m.content === "string" ? m.content.slice(0, 80) : typeof m.content;
        }
        return copy;
      });
      console.log("📤 OpenAI request messages:", JSON.stringify(debug));
    } catch {}

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
    const toolCallsFromMessage = Array.isArray((assistantMessage as any).tool_calls)
      ? (assistantMessage as any).tool_calls
      : [];

    if (!content && toolCallsFromMessage.length) {
      const action = {
        reply_text: "",
        expect_user_response: false,
        tool_calls: toolCallsFromMessage
          .filter((call: any) => call?.type === "function")
          .map((call: any) => ({
            name: call.function?.name ?? "",
            arguments_json: call.function?.arguments ?? "{}",
          })),
      } satisfies AssistantAction;

      return {
        action,
        assistantMessage: {
          role: assistantMessage.role || "assistant",
          content: JSON.stringify(action),
        },
      };
    }

    if (!content) {
      return {
        action: {
          reply_text: "",
          expect_user_response: false,
          tool_calls: [],
        },
        assistantMessage: {
          role: assistantMessage.role || "assistant",
          content: "{}",
        },
      };
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
