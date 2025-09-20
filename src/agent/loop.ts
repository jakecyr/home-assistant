import { openai, MODEL } from "./openai";
import type { ToolRegistry } from "../tools";
import type { ToolContext } from "../tools/_types";
import { ChatCompletionMessageParam } from "openai/resources";

type ToolCall = { id: string; name: string; arguments: any };

type AssistantMessage = {
  role?: string;
  content?:
    | string
    | Array<{
        type?: string;
        text?: string;
        name?: string;
        input?: any;
      }>
    | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

// --- Extract tool calls from Responses API result (robust to format drift) ---
function extractToolCalls(resp: any): ToolCall[] {
  const out: ToolCall[] = [];

  const firstChoice = resp?.choices?.[0];
  const message: AssistantMessage | undefined = firstChoice?.message;
  const rawCalls = message?.tool_calls || [];

  for (const call of rawCalls) {
    if (call?.type !== "function" || !call.function?.name) continue;
    let args: any = {};
    try {
      args =
        typeof call.function.arguments === "string"
          ? JSON.parse(call.function.arguments)
          : call.function.arguments;
    } catch (err) {
      console.warn("Failed to parse tool call arguments", err);
    }
    out.push({
      id: call.id || cryptoRandomId(),
      name: call.function.name,
      arguments: args,
    });
  }

  // Fallback: check for "tool_use" blocks (Responses content blocks)
  const blocks = message?.content;
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block?.type === "tool_use" && (block as any).name) {
        out.push({
          id: (block as any).id || cryptoRandomId(),
          name: (block as any).name,
          arguments: (block as any).input ?? {},
        });
      }
    }
  }

  return out;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}

type RunResult = {
  finalText: string;
  turns: number;
  toolUsed: boolean;
  lastToolMessage?: string | null;
};

export async function runAgentWithTools(
  userText: string,
  registry: ToolRegistry,
  ctx: ToolContext,
  {
    maxTurns = 6,
    history = [],
    extraSystemContext,
    debugTools = false,
  }: {
    maxTurns?: number;
    history?: ChatCompletionMessageParam[];
    extraSystemContext?: string;
    debugTools?: boolean;
  } = {}
): Promise<RunResult> {
  const baseSystem = `You are Jarvis, a voice agent on a Raspberry Pi.
Only respond when the user is clearly addressing you. If the transcript sounds like background chatter, off-topic speech, or another conversation, politely ignore it with a very brief acknowledgement like "No problem, I'll stay quiet." and wait for more input.
When the user asks to control lights, plugs, or other smart devices you MUST invoke the appropriate tool (\`tplink_toggle\` for TP-Link devices, \`wiz_toggle\` for WiZ devices). Never claim success without calling a tool. If you cannot match the requested device to one of the known names, tell the user the device is not configured and ask for clarification.
When tools are available, decide if any are needed. If you call tools, wait for their results before replying to the user.
Be concise. If no tools are needed, reply directly to the user.`;

  const system = extraSystemContext
    ? `${baseSystem}\n\n${extraSystemContext}`
    : baseSystem;

  let lastToolMessage: string | null = null;
  let toolUsed = false;

  if (debugTools) {
    console.log(
      `[tools] Debug enabled. Available tools: ${registry.names.join(", ")}`
    );
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userText },
  ];

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (debugTools) {
      console.debug(
        JSON.stringify({
          model: MODEL,
          messages,
          tools: registry.specs,
          tool_choice: "auto",
        })
      );
    }
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: registry.specs,
      tool_choice: "auto",
    });

    const assistantMessage: AssistantMessage =
      resp.choices?.[0]?.message || resp?.choices?.[0]?.message || {};

    const messageContent = assistantMessage?.content;
    let assistantText = "";
    if (typeof messageContent === "string") {
      assistantText = messageContent.trim();
    } else if (Array.isArray(messageContent)) {
      assistantText = messageContent
        .map((part) => (part?.type === "text" && part.text ? part.text : ""))
        .join(" ")
        .trim();
    }

    const assistantHistoryEntry: any = {
      role: assistantMessage.role || "assistant",
      content:
        typeof messageContent === "string"
          ? messageContent
          : Array.isArray(messageContent)
          ? messageContent
          : assistantText,
    } as ChatCompletionMessageParam;

    if (assistantMessage.tool_calls) {
      assistantHistoryEntry.tool_calls = assistantMessage.tool_calls;
    }

    messages.push(assistantHistoryEntry);

    if (assistantText && debugTools) {
      console.log(`[tools] Assistant text (turn ${turn}): ${assistantText}`);
    }

    // Did the model request any tools?
    const calls = extractToolCalls(resp);
    if (!calls.length) {
      // No tool calls => this is the final answer
      if (assistantText) {
        if (debugTools) {
          console.log(`[tools] No tool calls; returning assistant text.`);
        }
        return {
          finalText: assistantText,
          turns: turn,
          toolUsed,
          lastToolMessage,
        };
      }
      if (lastToolMessage) {
        if (debugTools) {
          console.log(`[tools] No tool calls; returning last tool message.`);
        }
        return {
          finalText: lastToolMessage,
          turns: turn,
          toolUsed: true,
          lastToolMessage,
        };
      }
      if (debugTools) {
        console.log(
          `[tools] No tool calls and no tool message; returning default response.`
        );
      }
      return { finalText: "Okay.", turns: turn, toolUsed, lastToolMessage };
    }

    // Execute tools, append tool results, and continue the loop
    for (const call of calls) {
      if (debugTools) {
        console.log(
          `[tools] Executing ${call.name} with args ${JSON.stringify(
            call.arguments
          )}`
        );
      }
      const result = await registry.exec(call.name, call.arguments, ctx);
      const payload = JSON.stringify(result);
      if (typeof result?.message === "string" && result.message.trim()) {
        lastToolMessage = result.message.trim();
      }
      if (debugTools) {
        console.log(`[tools] Result from ${call.name}: ${payload}`);
      }
      toolUsed = true;
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
  if (debugTools) {
    console.log(`[tools] Hit max turns, returning fallback: ${fallback}`);
  }
  return { finalText: fallback, turns: maxTurns, toolUsed, lastToolMessage };
}
