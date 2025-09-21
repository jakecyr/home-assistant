export type ConversationStateValue = "IDLE" | "LISTENING" | "THINKING" | "ACTING";

export interface ConversationHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationContext {
  history: ConversationHistoryEntry[];
  shouldContinue: (assistantReply: string) => boolean;
}
