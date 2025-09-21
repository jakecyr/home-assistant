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

    const workingMessages = [...messages];
    const appended: LlmMessage[] = [];

    const first = await this.llm.completeStructured(workingMessages, toolSpecs, {
      responseFormat: ASSISTANT_ACTION_JSON_SCHEMA,
      toolChoice: "none",
    });
    workingMessages.push(first.assistantMessage);
    appended.push(first.assistantMessage);

    let action = first.action;
    let toolUsed = false;

    if (Array.isArray(action.tool_calls) && action.tool_calls.length > 0) {
      toolUsed = true;
      action.tool_calls.forEach((call, index) => {
        if (!call.arguments || typeof call.arguments !== "object") {
          call.arguments = {};
        }
        if (!call.name || typeof call.name !== "string") {
          throw new Error("Tool call missing name.");
        }
        (call as any).__id = `${call.name}-${index}`;
      });

      for (const call of action.tool_calls) {
        const callId = (call as any).__id as string;
        const result = await this.invokeTool(call.name, call.arguments ?? {});
        const toolMessage: LlmMessage = {
          role: "tool",
          tool_call_id: callId,
          name: call.name,
          content: JSON.stringify(result),
        };
        workingMessages.push(toolMessage);
        appended.push(toolMessage);
      }

      const second = await this.llm.completeStructured(workingMessages, toolSpecs, {
        responseFormat: ASSISTANT_ACTION_JSON_SCHEMA,
        toolChoice: "none",
      });
      workingMessages.push(second.assistantMessage);
      appended.push(second.assistantMessage);
      action = second.action;
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
}
