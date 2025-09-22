import { BeepTimerTool } from '../../src/features/TimerTools/BeepTimerTool';

function makeTimers() {
  return {
    create: jest.fn((duration: number, options?: { label?: string }) => ({
      id: 't1',
      durationMs: duration,
      label: options?.label,
      finishesAt: new Date(Date.now() + duration),
    })),
  } as any;
}

function makeTime() {
  return {
    toLocaleTimeString: jest.fn(() => '12:34 PM'),
  } as any;
}

describe('BeepTimerTool', () => {
  test('creates timer with supplied duration parts', async () => {
    const timers = makeTimers();
    const time = makeTime();
    const tool = new BeepTimerTool(timers, time);

    const result = await tool.exec({ minutes: 1, seconds: 30, label: 'Tea' });

    expect(timers.create).toHaveBeenCalledWith(90_000, { label: 'Tea' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Timer set for 1 minute and 30 seconds');
    expect(result.message).toContain('It will play a 5-second beep');
  });

  test('rejects when no duration provided', async () => {
    const tool = new BeepTimerTool(makeTimers(), makeTime());

    const result = await tool.exec({});

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/provide/i);
  });
});
