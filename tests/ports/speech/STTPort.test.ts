import type { STTPort, TranscriptHandler } from '../../../src/ports/speech/STTPort';

describe('STTPort contract (dummy implementation)', () => {
  class FakeSTT implements STTPort {
    private handler: TranscriptHandler | null = null;
    started = false;
    chunks: Buffer[] = [];

    async start(): Promise<void> {
      this.started = true;
    }
    async stop(): Promise<void> {
      this.started = false;
    }
    sendPcm(chunk: Buffer): void {
      this.chunks.push(chunk);
    }
    onTranscript(handler: TranscriptHandler): () => void {
      this.handler = handler;
      return () => {
        this.handler = null;
      };
    }

    emit(text: string) {
      this.handler?.(text);
    }
  }

  test('registers transcript handler and unsubscribe works', async () => {
    const stt = new FakeSTT();

    await stt.start();
    expect(stt.started).toBe(true);

    const got: string[] = [];
    const off = stt.onTranscript((t) => got.push(t));

    stt.emit('hello');
    expect(got).toEqual(['hello']);

    off();
    stt.emit('world');
    expect(got).toEqual(['hello']);

    await stt.stop();
    expect(stt.started).toBe(false);
  });

  test('sendPcm collects audio chunks', () => {
    const stt = new FakeSTT();
    stt.sendPcm(Buffer.from([1,2,3,4]));
    stt.sendPcm(Buffer.from([5,6]));
    expect(stt.chunks).toHaveLength(2);
  });
});
