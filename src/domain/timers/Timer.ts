export interface Timer {
  id: string;
  label?: string;
  startedAt: number;
  finishesAt: number;
  durationMs: number;
}
