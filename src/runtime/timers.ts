import { EventEmitter } from "events";

export interface TimerRequest {
  id: string;
  label?: string;
  durationMs: number;
  fireAt: number;
}

interface InternalTimer extends TimerRequest {
  timeout: NodeJS.Timeout;
}

export interface TimerEvent {
  id: string;
  label?: string;
}

export class TimerService extends EventEmitter {
  private timers = new Map<string, InternalTimer>();

  scheduleTimer(durationMs: number, label?: string): TimerRequest {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error("Timer duration must be greater than zero");
    }

    const id = cryptoRandomId();
    const fireAt = Date.now() + durationMs;
    const timeout = setTimeout(() => {
      this.timers.delete(id);
      this.emit("timer-fired", { id, label } satisfies TimerEvent);
    }, durationMs);

    this.timers.set(id, { id, label, durationMs, fireAt, timeout });
    return { id, label, durationMs, fireAt } satisfies TimerRequest;
  }

  cancelTimer(id: string): boolean {
    const timer = this.timers.get(id);
    if (!timer) return false;
    clearTimeout(timer.timeout);
    this.timers.delete(id);
    return true;
  }

  listTimers(): TimerRequest[] {
    return Array.from(this.timers.values()).map(({ timeout, ...rest }) => rest);
  }
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}
