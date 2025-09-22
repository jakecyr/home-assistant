import { Topics } from '../../../src/domain/events/EventBus';

describe('EventBus Topics', () => {
  test('canonical topic names', () => {
    expect(Topics.TimerFinished).toBe('timer.finished');
    expect(Topics.WakeWordDetected).toBe('wakeword.detected');
    expect(Topics.UtteranceCaptured).toBe('stt.utterance');
    expect(Topics.AssistantSpeaking).toBe('assistant.speaking');
  });
});
