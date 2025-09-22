import type { EventBus } from "../domain/events/EventBus";
import { Topics } from "../domain/events/EventBus";
import type { AudioOutputPort } from "../ports/audio/AudioOutputPort";
import type { TimePort } from "../ports/sys/TimePort";
import type { Timer } from "../domain/timers/Timer";

export interface AlarmManagerOptions {
  toneFrequency?: number;
  toneDurationMs?: number;
  pauseMs?: number;
}

export class AlarmManager {
  private active: AbortController | null = null;
  private readonly maxRingMs = 5000;

  constructor(
    private readonly bus: EventBus,
    private readonly audioOut: AudioOutputPort,
    private readonly time: TimePort,
    private readonly options: AlarmManagerOptions = {}
  ) {}

  wire() {
    this.bus.subscribe<Timer>(Topics.TimerFinished, (timer) => {
      this.onTimerFinished(timer).catch((err) => {
        console.error("Alarm playback error:", err);
      });
    });

    this.bus.subscribe(Topics.WakeWordDetected, () => {
      this.dismiss();
    });
  }

  dismiss() {
    if (this.active) {
      this.active.abort();
      this.active = null;
    }
  }

  private async onTimerFinished(timer: Timer) {
    this.dismiss();
    const frequency = this.options.toneFrequency ?? 880;
    const toneDuration = this.options.toneDurationMs ?? 700;
    const pause = this.options.pauseMs ?? 150;

    const controller = new AbortController();
    this.active = controller;
    const toneFile = await this.audioOut.prepareTone("timer", {
      frequency,
      ms: toneDuration,
      volume: 0.3,
    });

    console.log(
      `🔔 Timer finished (${timer.id})${timer.label ? ` [${timer.label}]` : ""} at ${this.time.toLocaleTimeString(timer.finishesAt)}`
    );

    const loop = async () => {
      while (!controller.signal.aborted) {
        await this.audioOut.play(toneFile, { signal: controller.signal }).catch(() => {});
        if (controller.signal.aborted) break;
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
    };

    const timeout = setTimeout(() => {
      this.dismiss();
    }, this.maxRingMs);
    if (typeof timeout.unref === "function") timeout.unref();

    loop().finally(() => {
      clearTimeout(timeout);
      if (this.active === controller) {
        this.active = null;
      }
    });
  }
}
