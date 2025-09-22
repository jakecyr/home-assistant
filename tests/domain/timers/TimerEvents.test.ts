import { TimerTopics } from '../../../src/domain/timers/TimerEvents';

describe('TimerEvents', () => {
  test('TimerTopics.Finished matches canonical topic', () => {
    expect(TimerTopics.Finished).toBe('timer.finished');
  });
});
