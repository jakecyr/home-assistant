import type { AudioInputPort, AudioChunkHandler } from '../../../src/ports/audio/AudioInputPort';

describe('AudioInputPort contract (dummy implementation)', () => {
  class FakeAudioIn implements AudioInputPort {
    private handler: AudioChunkHandler | null = null;
    started = false;

    async start(): Promise<void> {
      this.started = true;
    }
    async stop(): Promise<void> {
      this.started = false;
    }
    onChunk(handler: AudioChunkHandler): () => void {
      this.handler = handler;
      return () => { this.handler = null; };
    }
    emit(chunk: Buffer) {
      this.handler?.(chunk);
    }
  }

  test('start/stop and chunk handler subscription/unsubscription', async () => {
    const ai = new FakeAudioIn();
    await ai.start();
    expect(ai.started).toBe(true);

    const received: Buffer[] = [];
    const off = ai.onChunk((buf) => received.push(buf));

    ai.emit(Buffer.from([1,2]));
    ai.emit(Buffer.from([3,4]));
    expect(received).toHaveLength(2);

    off();
    ai.emit(Buffer.from([5]));
    expect(received).toHaveLength(2);

    await ai.stop();
    expect(ai.started).toBe(false);
  });
});
