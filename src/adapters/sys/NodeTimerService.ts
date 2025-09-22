import { randomUUID } from "crypto";
import type { ITimerService, TimerOptions } from "../../domain/timers/TimerService";
import type { Timer } from "../../domain/timers/Timer";

const MAX_TIMEOUT_MS = 2_147_483_647; // ~24.8 days

type TimerRecord = Timer & {
  timeout: NodeJS.Timeout;
};

type TimerListener = (timer: Timer) => void;

export class NodeTimerService implements ITimerService {
  private readonly timers = new Map<string, TimerRecord>();
  private readonly listeners = new Set<TimerListener>();

  create(durationMs: number, options: TimerOptions = {}): Timer {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error("Timer duration must be a positive number of milliseconds.");
    }

    const label = options.label?.trim() || undefined;
    const id = randomUUID();
    const startedAt = Date.now();
    const finishesAt = startedAt + durationMs;

    const record: TimerRecord = {
      id,
      label,
      durationMs,
      startedAt,
      finishesAt,
      timeout: setTimeout(() => {}, 0),
    };

    const scheduleNext = () => {
      const remaining = record.finishesAt - Date.now();
      if (remaining <= 0) {
        this.timers.delete(id);
        const info = this.toInfo(record);
        for (const listener of this.listeners) {
          try {
            listener(info);
          } catch (err) {
            console.warn("Timer listener failed:", err);
          }
        }
        return;
      }

      const next = Math.min(remaining, MAX_TIMEOUT_MS);
      record.timeout = setTimeout(scheduleNext, next);
      if (typeof record.timeout.unref === "function") {
        record.timeout.unref();
      }
    };

    this.timers.set(id, record);
    scheduleNext();
    return this.toInfo(record);
  }

  cancel(id: string): boolean {
    const record = this.timers.get(id);
    if (!record) return false;
    clearTimeout(record.timeout);
    this.timers.delete(id);
    return true;
  }

  list(): Timer[] {
    return Array.from(this.timers.values()).map((record) => this.toInfo(record));
  }

  onFinished(handler: TimerListener): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private toInfo(record: TimerRecord): Timer {
    const { id, label, durationMs, startedAt, finishesAt } = record;
    return { id, label, durationMs, startedAt, finishesAt };
  }
}
