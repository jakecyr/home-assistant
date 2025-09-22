import type { TTSPort } from '../../../src/ports/speech/TTSPort';

describe('TTSPort contract (dummy implementation)', () => {
  class FakeTTS implements TTSPort {
    async synthesize(text: string): Promise<string> {
      return `/tmp/${text.replace(/\s+/g, '_')}.wav`;
    }
  }

  test('synthesize returns a file path', async () => {
    const tts = new FakeTTS();
    const path = await tts.synthesize('hello world');
    expect(path).toMatch(/\/tmp\/hello_world\.wav$/);
  });
});
