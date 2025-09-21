import type { AudioOutputPort, PlayOptions, PlayStreamOptions } from '../../../src/ports/audio/AudioOutputPort';

describe('AudioOutputPort contract (dummy implementation)', () => {
  class FakeAudioOut implements AudioOutputPort {
    played: { filePath: string; options?: PlayOptions }[] = [];
    tones: { name: string; opts: any }[] = [];
    streams: { chunks: Buffer[]; options: PlayStreamOptions }[] = [];

    async play(filePath: string, options?: PlayOptions): Promise<void> {
      this.played.push({ filePath, options });
    }
    async prepareTone(name: string, options: any): Promise<string> {
      this.tones.push({ name, opts: options });
      return `/tmp/${name}.wav`;
    }
    async playStream(stream: AsyncIterable<Buffer>, options: PlayStreamOptions): Promise<void> {
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c);
      this.streams.push({ chunks, options });
    }
  }

  async function* mkStream() {
    yield Buffer.from([1,2]);
    yield Buffer.from([3]);
  }

  test('supports play, prepareTone, and optional playStream', async () => {
    const out = new FakeAudioOut();

    const tone = await out.prepareTone('beep', { frequency: 440, ms: 200, volume: 0.5 });
    expect(tone).toBe('/tmp/beep.wav');

    await out.play('/tmp/file.wav', {});
    expect(out.played[0].filePath).toBe('/tmp/file.wav');

    await out.playStream(mkStream(), { sampleRate: 16000 });
    expect(out.streams[0].chunks.length).toBe(2);
    expect(out.streams[0].options.sampleRate).toBe(16000);
  });
});
