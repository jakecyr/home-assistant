export const TimerTopics = {
  Finished: "timer.finished",
} as const;

export type TimerTopic = (typeof TimerTopics)[keyof typeof TimerTopics];
