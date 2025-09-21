import { ConversationState } from "./ConversationState";

export class ConversationStateMachine {
  constructor(private readonly state: ConversationState) {}

  onWakeWord() {
    if (this.state.value === "IDLE") {
      this.state.toListening();
    }
  }

  onUserUtterance() {
    if (this.state.value === "LISTENING") {
      this.state.toThinking();
    }
  }

  onToolNeeded() {
    if (this.state.value === "THINKING") {
      this.state.toActing();
    }
  }

  onReplyDone(continueConversation: boolean) {
    if (continueConversation) {
      this.state.toListening();
    } else {
      this.state.toIdle();
    }
  }
}
