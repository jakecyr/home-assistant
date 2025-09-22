import type { ConversationStateValue } from "./types";

export class ConversationState {
  private current: ConversationStateValue = "IDLE";

  get value(): ConversationStateValue {
    return this.current;
  }

  toIdle() {
    this.current = "IDLE";
  }

  toListening() {
    this.current = "LISTENING";
  }

  toThinking() {
    this.current = "THINKING";
  }

  toActing() {
    this.current = "ACTING";
  }
}
