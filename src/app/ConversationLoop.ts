import { ConversationState } from "../domain/conversation/ConversationState";
import { ConversationStateMachine } from "../domain/conversation/ConversationStateMachine";
import type { EventBus } from "../domain/events/EventBus";
import { Topics } from "../domain/events/EventBus";
import type { ToolOrchestrator } from "./ToolOrchestrator";
import type { LlmMessage } from "./LlmPort";
import type { AssistantAction } from "../shared/contracts";
import { SpeechRenderer } from "./SpeechRenderer";

export interface ConversationLoopOptions {
  systemPrompt: string;
  maxHistoryMessages?: number;
  continueConversation?: (assistantText: string) => boolean;
}

export class ConversationLoop {
  private readonly state = new ConversationState();
  private readonly stateMachine = new ConversationStateMachine(this.state);
  private history: LlmMessage[] = [];

  constructor(
    private readonly bus: EventBus,
    private readonly orchestrator: ToolOrchestrator,
    private readonly speech: SpeechRenderer,
    private readonly options: ConversationLoopOptions
  ) {}

  start() {
    this.bus.subscribe(Topics.WakeWordDetected, () => {
      this.stateMachine.onWakeWord();
    });

    this.bus.subscribe<string>(Topics.UtteranceCaptured, (text) => {
      this.handleUserUtterance(text).catch((err) => {
        console.error("Conversation loop error:", err);
      });
    });
  }

  private async handleUserUtterance(text: string) {
    this.stateMachine.onUserUtterance();

    const userMessage: LlmMessage = { role: "user", content: text };
    const messages: LlmMessage[] = [
      { role: "system", content: this.options.systemPrompt },
      ...this.trimmedHistory(),
      userMessage,
    ];

    this.history.push(userMessage);

    const result = await this.orchestrator.run(messages);
    this.appendToHistory(result.appendedMessages);

    if (result.toolUsed) {
      this.stateMachine.onToolNeeded();
    }
    const action = result.action;

    await this.speech.render(action);

    const shouldContinue = this.shouldContinue(action);
    this.stateMachine.onReplyDone(shouldContinue);
  }

  private trimmedHistory(): LlmMessage[] {
    const max = this.options.maxHistoryMessages ?? 12;
    const slice = this.history.slice(-max);
    return slice.map((msg) => ({ ...msg }));
  }

  private appendToHistory(messages: LlmMessage[]) {
    for (const msg of messages) {
      this.history.push({ ...msg });
    }
  }

  private shouldContinue(action: AssistantAction): boolean {
    if (typeof action.expect_user_response === "boolean") {
      return action.expect_user_response;
    }
    if (this.options.continueConversation) {
      return this.options.continueConversation(action.reply_text || "");
    }
    return false;
  }
}
