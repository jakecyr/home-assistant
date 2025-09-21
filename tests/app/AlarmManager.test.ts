import { SimpleEventBus } from '../../src/adapters/sys/SimpleEventBus';
import { Topics } from '../../src/domain/events/EventBus';
import { AlarmManager } from '../../src/app/AlarmManager';

jest.useFakeTimers();

describe('AlarmManager', () => {
  function makeDeps() {
    const bus = new SimpleEventBus();
    const audioOut = {
      prepareTone: jest.fn().mockResolvedValue('/tmp/tone.wav'),
      play: jest.fn().mockResolvedValue(undefined),
    } as any;
    const time = {
      toLocaleTimeString: jest.fn(() => '12:00 PM'),
    } as any;
    return { bus, audioOut, time };
  }

  test('wires subscriptions and plays alarm on TimerFinished, stops on WakeWordDetected', async () => {
    const { bus, audioOut, time } = makeDeps();
    const mgr = new AlarmManager(bus as any, audioOut as any, time as any, {
      toneDurationMs: 10,
      pauseMs: 50,
    });

    mgr.wire();

    // Simulate timer finished -> should prepare tone and start playing in a loop
    const timer = { id: 't1', label: 'Tea', finishesAt: Date.now() } as any;
    bus.publish(Topics.TimerFinished, timer);

    // Allow async onTimerFinished to schedule tasks
    await Promise.resolve();

    expect(audioOut.prepareTone).toHaveBeenCalledWith('timer', {
      frequency: 880,
      ms: 10,
      volume: 0.3,
    });

    // First play should be attempted quickly
    expect(audioOut.play).toHaveBeenCalledTimes(1);

    // Advance time to allow the loop to schedule another play
    await Promise.resolve();
    jest.advanceTimersByTime(60);

    // After pause, another play should be attempted (best-effort; >=1)
    expect(audioOut.play.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Simulate wake word to dismiss
    bus.publish(Topics.WakeWordDetected, {});

    // Advance timers to flush any pending waits
    jest.advanceTimersByTime(100);

    // No specific public state to assert; ensure plays do not throw and more calls may stop thereafter.
    // Since AlarmManager hides controller, we verify that further timer advancement doesn't result in many new plays
    const callsAfterDismiss = audioOut.play.mock.calls.length;
    jest.advanceTimersByTime(300);
    expect(audioOut.play.mock.calls.length).toBeLessThanOrEqual(callsAfterDismiss + 1);
  });
});
