import type { LlmPort, LlmMessage } from "./LlmPort";
import type {
  ToolRegistryPort,
  ToolDefinition,
  ToolExecutionResult,
} from "../ports/tools/ToolRegistryPort";
import type { AssistantAction } from "../shared/contracts";
import { ASSISTANT_ACTION_JSON_SCHEMA } from "../shared/contracts";

function buildToolSpecs(defs: ToolDefinition[]) {
  return defs.map((def) => ({
    type: "function",
    function: {
      name: def.name,
      description: def.description,
      parameters: def.schema,
    },
  }));
}

export class ToolOrchestrator {
  constructor(
    private readonly llm: LlmPort,
    private readonly tools: ToolRegistryPort
  ) {}

  async run(messages: LlmMessage[]): Promise<{
    action: AssistantAction;
    appendedMessages: LlmMessage[];
    toolUsed: boolean;
  }> {
    const toolDefs = this.tools.list();
    const toolSpecs = buildToolSpecs(toolDefs);
    const validToolNames = new Set(toolDefs.map((t) => t.name));
    const toolChoice = toolDefs.length ? "auto" : "none";

    const resolveToolName = (raw: string): string | null => {
      if (!raw || typeof raw !== "string") return null;

      const candidates = new Set<string>();
      const addCandidates = (value: string | null | undefined) => {
        if (!value) return;
        const base = value.trim();
        if (!base) return;
        const withUnderscores = base.replace(/[ .]/g, "_");
        const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, "_");
        const variants = [
          base,
          base.toLowerCase(),
          withUnderscores,
          withUnderscores.toLowerCase(),
          sanitized,
          sanitized.toLowerCase(),
        ];
        for (const variant of variants) {
          if (variant.length > 0) {
            candidates.add(variant);
          }
        }
      };

      const trimmed = raw.trim();
      addCandidates(trimmed);

      const prefixStripped = trimmed.replace(
        /^(?:function|functions|tool|tools)[\s.:_-]*/i,
        ""
      );
      if (prefixStripped !== trimmed) {
        addCandidates(prefixStripped);
      }

      const segments = trimmed.split(/[:.]/).filter((segment) => segment.length > 0);
      if (segments.length > 1) {
        addCandidates(segments[segments.length - 1]);
      }

      for (const candidate of candidates) {
        if (validToolNames.has(candidate)) return candidate;
      }

      return null;
    };

    const workingMessages = [...messages];
    const appended: LlmMessage[] = [];

    const first = await this.llm.completeStructured(workingMessages, toolSpecs, {
      responseFormat: ASSISTANT_ACTION_JSON_SCHEMA,
      toolChoice,
    });
    workingMessages.push(first.assistantMessage);
    appended.push(first.assistantMessage);

    let action = normalizeAction(first.action);
    let toolUsed = false;

    if (Array.isArray(action.tool_calls) && action.tool_calls.length > 0) {
      toolUsed = true;
      action.tool_calls.forEach((call, index) => {
        if (!call.name || typeof call.name !== "string") {
          throw new Error("Tool call missing name.");
        }
        if (typeof call.arguments_json !== "string") {
          throw new Error(`Tool call ${call.name} missing arguments_json string.`);
        }
        const resolved = resolveToolName(call.name);
        if (!resolved) {
          throw new Error(
            `Unknown or invalid tool name "${call.name}". Known tools: ${Array.from(validToolNames).join(
              ", "
            )}`,
          );
        }
        (call as any).__resolved_name = resolved;
        (call as any).__id = `${resolved}-${index}`;
      });

      // Insert an assistant message that declares tool_calls before any 'tool' messages
      // so that the OpenAI API properly associates tool responses.
      const assistantToolCallsMessage: LlmMessage = {
        role: "assistant",
        content: "",
        tool_calls: action.tool_calls.map((call) => ({
          id: (call as any).__id as string,
          type: "function" as const,
          function: {
            name: ((call as any).__resolved_name as string) || (call.name as string),
            arguments: call.arguments_json as string,
          },
        })),
      };
      workingMessages.push(assistantToolCallsMessage);
      appended.push(assistantToolCallsMessage);
      console.log(
        "🔧 Declared assistant tool_calls:",
        JSON.stringify(assistantToolCallsMessage.tool_calls?.map((t) => t.function.name))
      );

      for (const call of action.tool_calls) {
        const callId = (call as any).__id as string;
        const resolvedName = ((call as any).__resolved_name as string) || call.name;
        const args = this.parseArguments(call.arguments_json, resolvedName);
        const result = await this.invokeTool(resolvedName, args);
        const toolMessage: LlmMessage = {
          role: "tool",
          tool_call_id: callId,
          name: resolvedName,
          content: JSON.stringify(result),
        };
        workingMessages.push(toolMessage);
        appended.push(toolMessage);
      }

      const second = await this.llm.completeStructured(workingMessages, toolSpecs, {
        responseFormat: ASSISTANT_ACTION_JSON_SCHEMA,
        toolChoice,
      });
      workingMessages.push(second.assistantMessage);
      appended.push(second.assistantMessage);
      action = normalizeAction(second.action);
    }

    return { action, appendedMessages: appended, toolUsed };
  }

  private async invokeTool(
    name: string,
    args: any
  ): Promise<ToolExecutionResult> {
    try {
      return await this.tools.exec(name, args);
    } catch (err) {
      return {
        ok: false,
        message: `Tool "${name}" failed: ${(err as Error).message}`,
      };
    }
  }

  private parseArguments(raw: string, toolName: string): any {
    try {
      if (!raw.trim()) return {};
      return JSON.parse(raw);
    } catch (err) {
      console.warn(
        `Failed to parse arguments for tool ${toolName}; passing empty object.`,
        err
      );
      return {};
    }
  }
}

function normalizeAction(action: AssistantAction): AssistantAction {
  return {
    reply_text: action.reply_text ?? "",
    expect_user_response: Boolean(action.expect_user_response),
    tool_calls: Array.isArray(action.tool_calls) ? action.tool_calls : [],
  };
}
