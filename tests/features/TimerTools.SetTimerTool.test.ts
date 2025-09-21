import { SetTimerTool } from '../../src/features/TimerTools/SetTimerTool';
import type { ITimerService } from '../../src/domain/timers/TimerService';
import type { TimePort } from '../../src/ports/sys/TimePort';

describe('SetTimerTool', () => {
  function makeTimers(): ITimerService {
    return {
      create: jest.fn((durationMs: number, options?: any) => ({
        id: 't1',
        label: options?.label,
        startedAt: 1000,
        finishesAt: 1000 + durationMs,
        durationMs,
      })),
      cancel: jest.fn(),
      list: jest.fn(),
      onFinished: jest.fn(),
    } as any;
  }

  function makeTime(): TimePort {
    return {
      now: () => 1000,
      toLocaleTimeString: (ms: number) => new Date(ms).toISOString(),
    } as any;
  }

  test('requires at least one of hours/minutes/seconds', async () => {
    const tool = new SetTimerTool(makeTimers(), makeTime());
    const res = await tool.exec({});
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Provide hours, minutes, or seconds/);
  });

  test('duration must be > 0', async () => {
    const tool = new SetTimerTool(makeTimers(), makeTime());
    const res = await tool.exec({ hours: 0, minutes: 0, seconds: 0 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/greater than zero/);
  });

  test('rejects excessively large duration (not safe integer)', async () => {
    const tool = new SetTimerTool(makeTimers(), makeTime());
    const res = await tool.exec({ seconds: Number.MAX_SAFE_INTEGER });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/too large/);
  });

  test('happy path creates timer, formats message and includes label', async () => {
    const timers = makeTimers();
    const time = makeTime();
    const tool = new SetTimerTool(timers, time);

    const res = await tool.exec({ hours: 1, minutes: 2, seconds: 3, label: 'Tea' });

    // totalSeconds = 3723 -> durationMs = 3_723_000
    expect((timers.create as jest.Mock).mock.calls[0][0]).toBe(3723000);
    expect((timers.create as jest.Mock).mock.calls[0][1]).toEqual({ label: 'Tea' });

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Timer set for 1 hour, 2 minutes, and 3 seconds, labeled "Tea", ending at/);

    // returned data is the timer from create()
    expect(res.data).toMatchObject({ id: 't1', durationMs: 3723000, label: 'Tea' });
  });

  test('coerces fractional and string inputs and trims label', async () => {
    const timers = makeTimers();
    const tool = new SetTimerTool(timers, makeTime());

    const res = await tool.exec({ hours: '1.9' as any, minutes: 0.6 as any, seconds: '2.2' as any, label: '  nap  ' });

    // Should floor 1.9 -> 1, 0.6 -> 0, 2.2 -> 2 => total 1h 0m 2s
    expect((timers.create as jest.Mock).mock.calls[0][0]).toBe((1 * 3600 + 0 * 60 + 2) * 1000);
    expect((timers.create as jest.Mock).mock.calls[0][1]).toEqual({ label: 'nap' });

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/1 hour and 2 seconds/);
  });
});
