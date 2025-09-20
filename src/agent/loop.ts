import { openai, MODEL } from "./openai";
import type { ToolRegistry } from "../tools";
import type { ToolContext } from "../tools/_types";
import { ChatCompletionMessageParam } from "openai/resources";

type ToolCall = { id: string; name: string; arguments: any };

// --- Extract tool calls from Responses API result (robust to format drift) ---
function extractToolCalls(resp: any): ToolCall[] {
  const out: ToolCall[] = [];

  // Primary: assistant message with tool_calls (Chat Completions-like)
  const msg = resp?.output?.[0]?.message || resp?.output?.[0];
  const tc = msg?.tool_calls || resp?.tool_calls;
  if (Array.isArray(tc)) {
    for (const t of tc) {
      if (t?.type === "function" && t?.function?.name) {
        let args: any = {};
        try {
          args =
            typeof t.function.arguments === "string"
              ? JSON.parse(t.function.arguments)
              : t.function.arguments;
        } catch {}
        out.push({
          id: t.id || cryptoRandomId(),
          name: t.function.name,
          arguments: args,
        });
      }
    }
  }

  // Fallback: content blocks with "tool_use" (some SDKs emit this)
  const blocks = msg?.content;
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (b?.type === "tool_use" && b?.name) {
        out.push({
          id: b.id || cryptoRandomId(),
          name: b.name,
          arguments: b.input ?? {},
        });
      }
    }
  }

  return out;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}

export async function runAgentWithTools(
  userText: string,
  registry: ToolRegistry,
  ctx: ToolContext,
  {
    maxTurns = 6,
    history = [],
  }: { maxTurns?: number; history?: ChatCompletionMessageParam[] } = {}
): Promise<{ finalText: string; turns: number }> {
  const system = `You are Jarvis, a voice agent on a Raspberry Pi.
Only respond when the user is clearly addressing you. If the transcript sounds like background chatter, off-topic speech, or another conversation, politely ignore it with a very brief acknowledgement like "No problem, I'll stay quiet." and wait for more input.
When tools are available, decide if any are needed. If you call tools, wait for their results before replying to the user.
Be concise. If no tools are needed, reply directly to the user.`;

  let lastToolMessage: string | null = null;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];

  for (let turn = 1; turn <= maxTurns; turn++) {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: registry.specs,
      tool_choice: "auto",
    });

    // Gather assistant text (if any)
    const assistantText = (resp.choices[0].message?.content || "").trim();
    if (assistantText) {
      messages.push({ role: "assistant", content: assistantText });
    }

    // Did the model request any tools?
    const calls = extractToolCalls(resp);
    if (!calls.length) {
      // No tool calls => this is the final answer
      if (assistantText) {
        return { finalText: assistantText, turns: turn };
      }
      if (lastToolMessage) {
        return { finalText: lastToolMessage, turns: turn };
      }
      return { finalText: "Okay.", turns: turn };
    }

    // Execute tools, append tool results, and continue the loop
    for (const call of calls) {
      const result = await registry.exec(call.name, call.arguments, ctx);
      const payload = JSON.stringify(result);
      if (typeof result?.message === "string" && result.message.trim()) {
        lastToolMessage = result.message.trim();
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: payload,
      });
    }

    // Loop continues; the next iteration gives the LLM both its
    // previous assistant content and the tool results so it can decide
    // to call more tools or answer the user.
  }

  const fallback = lastToolMessage || "Okay.";
  return { finalText: fallback, turns: maxTurns };
}
