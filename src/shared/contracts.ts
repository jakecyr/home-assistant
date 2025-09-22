export type AssistantAction = {
  reply_text: string;
  tool_calls: Array<{
    name: string;
    arguments_json: string;
  }>;
  expect_user_response: boolean;
};

export const ASSISTANT_ACTION_JSON_SCHEMA = {
  name: "assistant_action",
  schema: {
    type: "object",
    properties: {
      reply_text: {
        type: "string",
        description: "Short, immediately sayable response to the user.",
      },
      tool_calls: {
        type: "array",
        description: "Planned tool invocations to execute before replying.",
        items: {
          type: "object",
          required: ["name", "arguments_json"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              description: "Tool name from the registered tool list.",
            },
            arguments_json: {
              type: "string",
              description:
                "JSON string containing the tool arguments. Must match the tool schema when parsed.",
            },
          },
        },
      },
      expect_user_response: {
        type: "boolean",
        description: "Set true if the assistant expects the user to respond immediately after the reply.",
      },
    },
    required: ["reply_text", "tool_calls", "expect_user_response"],
    additionalProperties: false,
  },
} as const;
