import { OpenAiTTS } from '../../../src/adapters/speech/OpenAiTTS';

jest.mock('../../../src/openai', () => ({
  getOpenAI: () => ({
    audio: {
      speech: {
        create: jest.fn(async ({ model, voice, input, response_format }) => {
          // Return an object with arrayBuffer method
          const data = Buffer.from([1,2,3,4]);
          return {
            arrayBuffer: async () => data,
          } as any;
        }),
      },
    },
  }),
}));

jest.mock('fs', () => ({ promises: { writeFile: jest.fn(async () => {}) } }));

jest.mock('../../../src/env', () => ({
  OPENAI_VOICE_MODEL: 'gpt-4o-mini-tts',
  OPENAI_VOICE_NAME: 'alloy',
}));

describe('OpenAiTTS', () => {
  test('synthesize writes wav file and returns path', async () => {
    const tts = new OpenAiTTS();
    const file = await tts.synthesize('Hello world');
    expect(typeof file).toBe('string');
    const { promises } = require('fs');
    expect(promises.writeFile).toHaveBeenCalled();
  });

  test('empty text returns silence wav path', async () => {
    const tts = new OpenAiTTS();
    const file = await tts.synthesize('   ');
    expect(typeof file).toBe('string');
    const { promises } = require('fs');
    expect(promises.writeFile).toHaveBeenCalled();
  });
});
