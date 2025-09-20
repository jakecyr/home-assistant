export class AlarmController {
  private interval?: NodeJS.Timeout;
  private timeout?: NodeJS.Timeout;
  private active = false;
  private endTime = 0;

  constructor(private playBeep: () => Promise<void> | void) {}

  start(label?: string, durationMs = 10_000) {
    if (this.active) {
      this.stop();
    }
    this.active = true;
    this.endTime = Date.now() + durationMs;
    this.playBeepSafe();
    this.interval = setInterval(() => {
      if (!this.active) return;
      if (Date.now() >= this.endTime) {
        this.stop();
        return;
      }
      this.playBeepSafe();
    }, 1000);

    this.timeout = setTimeout(() => {
      this.stop();
    }, durationMs);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  private playBeepSafe() {
    try {
      const result = this.playBeep();
      if (result instanceof Promise) {
        result.catch((err) => console.warn("Alarm beep error", err));
      }
    } catch (err) {
      console.warn("Alarm beep error", err);
    }
  }
}
