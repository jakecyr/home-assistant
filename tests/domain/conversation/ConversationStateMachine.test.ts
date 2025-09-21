import { ConversationState } from '../../../src/domain/conversation/ConversationState';
import { ConversationStateMachine } from '../../../src/domain/conversation/ConversationStateMachine';

describe('ConversationStateMachine', () => {
  test('onWakeWord moves IDLE -> LISTENING only', () => {
    const s = new ConversationState();
    const sm = new ConversationStateMachine(s);

    expect(s.value).toBe('IDLE');
    sm.onWakeWord();
    expect(s.value).toBe('LISTENING');

    // Calling again should not change since already LISTENING
    sm.onWakeWord();
    expect(s.value).toBe('LISTENING');
  });

  test('onUserUtterance moves LISTENING -> THINKING only', () => {
    const s = new ConversationState();
    const sm = new ConversationStateMachine(s);

    sm.onUserUtterance(); // from IDLE should do nothing
    expect(s.value).toBe('IDLE');

    s.toListening();
    sm.onUserUtterance();
    expect(s.value).toBe('THINKING');

    sm.onUserUtterance(); // from THINKING should do nothing
    expect(s.value).toBe('THINKING');
  });

  test('onToolNeeded moves THINKING -> ACTING only', () => {
    const s = new ConversationState();
    const sm = new ConversationStateMachine(s);

    sm.onToolNeeded();
    expect(s.value).toBe('IDLE'); // no change from IDLE

    s.toListening();
    sm.onToolNeeded();
    expect(s.value).toBe('LISTENING'); // still no change

    s.toThinking();
    sm.onToolNeeded();
    expect(s.value).toBe('ACTING');
  });

  test('onReplyDone moves to LISTENING when continue=true, else IDLE', () => {
    const s = new ConversationState();
    const sm = new ConversationStateMachine(s);

    s.toThinking();
    sm.onReplyDone(true);
    expect(s.value).toBe('LISTENING');

    sm.onReplyDone(false);
    expect(s.value).toBe('IDLE');
  });
});
