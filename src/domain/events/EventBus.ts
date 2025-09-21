export interface Subscription {
  unsubscribe(): void;
}

export interface EventBus {
  publish<T>(topic: string, payload: T): void;
  subscribe<T>(topic: string, handler: (payload: T) => void): Subscription;
}

export const Topics = {
  TimerFinished: "timer.finished",
  WakeWordDetected: "wakeword.detected",
  UtteranceCaptured: "stt.utterance",
  AssistantSpeaking: "assistant.speaking",
} as const;
