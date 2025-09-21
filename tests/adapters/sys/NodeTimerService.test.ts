import { NodeTimerService } from '../../../src/adapters/sys/NodeTimerService';

jest.useFakeTimers();

describe('NodeTimerService', () => {
  test('create validates positive duration', () => {
    const svc = new NodeTimerService();
    expect(() => svc.create(0)).toThrow(/positive/);
    expect(() => svc.create(-5)).toThrow(/positive/);
    expect(() => svc.create(Number.NaN)).toThrow(/positive/);
  });

  test('create, list, and finish triggers listeners and removal', () => {
    const svc = new NodeTimerService();
    const finished: any[] = [];
    const unsub = svc.onFinished((t) => finished.push(t));

    const timer = svc.create(100, { label: 'demo' });
    expect(timer.label).toBe('demo');
    expect(svc.list().length).toBe(1);

    // advance time to trigger finish
    jest.advanceTimersByTime(120);

    expect(finished.length).toBe(1);
    expect(finished[0].id).toBe(timer.id);
    expect(svc.list().length).toBe(0);

    unsub();
  });

  test('cancel removes timer and prevents finish', () => {
    const svc = new NodeTimerService();
    const finished: any[] = [];
    svc.onFinished((t) => finished.push(t));

    const timer = svc.create(100);
    expect(svc.list().length).toBe(1);

    const ok = svc.cancel(timer.id);
    expect(ok).toBe(true);
    expect(svc.list().length).toBe(0);

    jest.advanceTimersByTime(200);
    expect(finished.length).toBe(0);
  });
});
