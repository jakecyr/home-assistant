import { ConversationState } from '../../../src/domain/conversation/ConversationState';

describe('ConversationState', () => {
  test('initial state is IDLE', () => {
    const s = new ConversationState();
    expect(s.value).toBe('IDLE');
  });

  test('transitions set exact values', () => {
    const s = new ConversationState();

    s.toListening();
    expect(s.value).toBe('LISTENING');

    s.toThinking();
    expect(s.value).toBe('THINKING');

    s.toActing();
    expect(s.value).toBe('ACTING');

    s.toIdle();
    expect(s.value).toBe('IDLE');
  });
});
