import type { Timer } from "./Timer";

export interface TimerOptions {
  label?: string;
}

export interface ITimerService {
  create(durationMs: number, options?: TimerOptions): Timer;
  cancel(id: string): boolean;
  list(): Timer[];
  onFinished(handler: (timer: Timer) => void): () => void;
}
