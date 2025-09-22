import { NodeTime } from '../../../src/adapters/sys/NodeTime';

describe('NodeTime', () => {
  const time = new NodeTime();

  test('now delegates to Date.now', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    expect(time.now()).toBe(1234567890);
    spy.mockRestore();
  });

  test('toLocaleTimeString formats given epoch', () => {
    const str = time.toLocaleTimeString(0);
    expect(typeof str).toBe('string');
  });
});
