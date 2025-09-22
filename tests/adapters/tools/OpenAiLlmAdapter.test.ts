import { OpenAiLlmAdapter } from '../../../src/adapters/tools/OpenAiLlmAdapter';

jest.mock('../../../src/openai', () => ({
  getOpenAI: () => ({
    chat: {
      completions: {
        create: jest.fn(async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({ type: 'say', text: 'hello' }),
              },
            },
          ],
        })),
      },
    },
  }),
}));

describe('OpenAiLlmAdapter', () => {
  test('completeStructured maps messages and parses JSON action', async () => {
    const adapter = new OpenAiLlmAdapter();

    const result = await adapter.completeStructured(
      [
        { role: 'system', content: 'You are a bot' },
        { role: 'user', content: 'hi' },
      ],
      [],
      { responseFormat: { name: 'Action', schema: { type: 'object' } } }
    );

    expect(result.action).toEqual({ type: 'say', text: 'hello' });
    expect(result.assistantMessage.role).toBe('assistant');
    expect(typeof result.assistantMessage.content).toBe('string');
  });

  test('gracefully handles empty responses', async () => {
    jest.resetModules();
    jest.doMock('../../../src/openai', () => ({
      getOpenAI: () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { role: 'assistant', content: '' } }] }) } },
      }),
    }));
    let FreshAdapter: any;
    jest.isolateModules(() => {
      // require inside isolated module context to pick up mocks
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      FreshAdapter = require('../../../src/adapters/tools/OpenAiLlmAdapter').OpenAiLlmAdapter;
    });
    const adapter = new FreshAdapter();
    const result = await adapter.completeStructured([], [], {
      responseFormat: { name: 'x', schema: {} },
    });

    expect(result).toEqual({
      action: { reply_text: '', expect_user_response: false, tool_calls: [] },
      assistantMessage: { role: 'assistant', content: '{}' },
    });
  });
});
