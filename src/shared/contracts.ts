export type AssistantAction = {
  reply_text: string;
  speak_ssml?: string;
  tool_calls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
  expect_user_response: boolean;
  metadata?: {
    tone?: "neutral" | "friendly" | "brief";
    suggestions?: string[];
  };
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
      speak_ssml: {
        type: "string",
        description: "Optional SSML to render instead of reply_text.",
      },
      tool_calls: {
        type: "array",
        description: "Planned tool invocations to execute before replying.",
        items: {
          type: "object",
          required: ["name", "arguments"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              description: "Tool name from the registered tool list.",
            },
            arguments: {
              type: "object",
              description: "Arguments object matching the tool schema.",
              additionalProperties: true,
            },
          },
        },
      },
      expect_user_response: {
        type: "boolean",
        description: "Set true if the assistant expects the user to respond immediately after the reply.",
      },
      metadata: {
        type: "object",
        description: "Optional extra annotations for UI rendering.",
        additionalProperties: false,
        properties: {
          tone: {
            type: "string",
            enum: ["neutral", "friendly", "brief"],
          },
          suggestions: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    required: ["reply_text", "expect_user_response"],
    additionalProperties: false,
  },
} as const;
