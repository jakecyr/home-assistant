import { SimpleEventBus } from '../../src/adapters/sys/SimpleEventBus';
import { Topics } from '../../src/domain/events/EventBus';
import { ConversationLoop } from '../../src/app/ConversationLoop';

function makeOrchestrator() {
  return {
    run: jest.fn(),
  } as any;
}

function makeSpeech() {
  return {
    render: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('ConversationLoop', () => {
  const systemPrompt = 'You are helpful.';

  test('builds messages, calls orchestrator, appends history, and calls speech', async () => {
    const bus = new SimpleEventBus();
    const orchestrator = makeOrchestrator();
    const speech = makeSpeech();

    orchestrator.run.mockResolvedValue({
      action: { reply_text: 'Hello', expect_user_response: false, tool_calls: [] },
      appendedMessages: [
        { role: 'assistant', content: 'Hello' },
      ],
      toolUsed: false,
    });

    const loop = new ConversationLoop(bus as any, orchestrator, speech, {
      systemPrompt,
      maxHistoryMessages: 3,
    });

    loop.start();

    bus.publish(Topics.WakeWordDetected, {});
    bus.publish(Topics.UtteranceCaptured, 'What\'s the weather?');

    await Promise.resolve();

    expect(orchestrator.run).toHaveBeenCalledTimes(1);
    const [messages] = orchestrator.run.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'system', content: systemPrompt });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: "What's the weather?" });

    expect(speech.render).toHaveBeenCalledWith({ reply_text: 'Hello', expect_user_response: false, tool_calls: [] });
  });

  test('shouldContinue uses action flag over options callback', async () => {
    const bus = new SimpleEventBus();
    const orchestrator = makeOrchestrator();
    const speech = makeSpeech();

    orchestrator.run.mockResolvedValue({
      action: { reply_text: 'Hi', expect_user_response: true, tool_calls: [] },
      appendedMessages: [ { role: 'assistant', content: 'Hi' } ],
      toolUsed: false,
    });

    const continueConversation = jest.fn(() => false);

    const loop = new ConversationLoop(bus as any, orchestrator, speech, {
      systemPrompt,
      continueConversation,
    });

    loop.start();
    bus.publish(Topics.UtteranceCaptured, 'Hey');
    await Promise.resolve();

    // ensure callback was not needed because flag was provided
    expect(continueConversation).not.toHaveBeenCalled();
  });
});
