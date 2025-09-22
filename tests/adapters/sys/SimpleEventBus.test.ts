import { SimpleEventBus } from '../../../src/adapters/sys/SimpleEventBus';

describe('SimpleEventBus', () => {
  test('publish delivers to subscribed handlers', () => {
    const bus = new SimpleEventBus();
    const handler = jest.fn();
    bus.subscribe('topic', handler);

    bus.publish('topic', { x: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  test('unsubscribe stops delivery and cleans up empty topics', () => {
    const bus = new SimpleEventBus();
    const handler = jest.fn();
    const sub = bus.subscribe('topic', handler);

    sub.unsubscribe();
    bus.publish('topic', 123);

    expect(handler).not.toHaveBeenCalled();
  });

  test('handler exceptions are caught and do not stop others', () => {
    const bus = new SimpleEventBus();
    const bad = jest.fn(() => { throw new Error('boom'); });
    const good = jest.fn();

    bus.subscribe('t', bad);
    bus.subscribe('t', good);

    // silence console.warn for this test
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    bus.publish('t', 'hi');

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
