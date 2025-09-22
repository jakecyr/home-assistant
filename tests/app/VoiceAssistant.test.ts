import { SimpleEventBus } from '../../src/adapters/sys/SimpleEventBus';
import { Topics } from '../../src/domain/events/EventBus';
import { VoiceAssistant } from '../../src/app/VoiceAssistant';

function makeAudioIn() {
  let handler: ((chunk: Buffer) => void) | null = null;
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    onChunk: jest.fn((h: (chunk: Buffer) => void) => {
      handler = h;
      return () => { handler = null; };
    }),
    emit(chunk: Buffer) {
      handler?.(chunk);
    },
  } as any;
}

function makeStt() {
  let handler: ((text: string) => void) | null = null;
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    sendPcm: jest.fn(),
    onTranscript: jest.fn((cb: (t: string) => void) => {
      handler = cb;
      return () => {
        handler = null;
      };
    }),
    emitTranscript(text: string) {
      handler?.(text);
    },
  } as any;
}

function makeAudioOut() {
  return {
    play: jest.fn().mockResolvedValue(undefined),
    prepareTone: jest.fn(async (name: string) => `${name}.wav`),
  } as any;
}

async function flushAsync() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

describe('VoiceAssistant', () => {
  test('auto-listen mode streams chunks to STT and publishes wake event on start', async () => {
    const bus = new SimpleEventBus();
    const audioIn = makeAudioIn();
    const stt = makeStt();
    const audioOut = makeAudioOut();

    const wakeEvent = jest.fn();
    bus.subscribe(Topics.WakeWordDetected, wakeEvent);

    const va = new VoiceAssistant(bus as any, audioIn as any, audioOut as any, undefined, stt as any, {
      startListeningOnLaunch: true,
    });

    await va.start();
    await flushAsync();

    // Auto-listen should have published a wake-like event to kick off
    expect(wakeEvent).toHaveBeenCalled();
    expect(audioOut.prepareTone).toHaveBeenCalledWith('listen-start', expect.any(Object));
    expect(audioOut.play).toHaveBeenCalledWith('listen-start.wav');

    // Emulate incoming audio
    const chunk = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    audioIn.emit(chunk);

    expect(stt.sendPcm).toHaveBeenCalledWith(chunk);

    // Transcript received should publish UtteranceCaptured
    const utterHandler = jest.fn();
    bus.subscribe(Topics.UtteranceCaptured, utterHandler);

    stt.emitTranscript('  hello  ');
    await flushAsync();

    expect(utterHandler).toHaveBeenCalledWith('hello');
    expect(audioOut.prepareTone).toHaveBeenCalledWith('listen-stop', expect.any(Object));
    expect(audioOut.play).toHaveBeenLastCalledWith('listen-stop.wav');
  });

  test('wake-word mode triggers listening when detected and then streams to STT', async () => {
    const bus = new SimpleEventBus();
    const audioIn = makeAudioIn();
    const stt = makeStt();
    const audioOut = makeAudioOut();

    const wakeWord = {
      processPcm: jest.fn(() => true),
    } as any;

    const wakeEvent = jest.fn();
    bus.subscribe(Topics.WakeWordDetected, wakeEvent);

    const va = new VoiceAssistant(
      bus as any,
      audioIn as any,
      audioOut as any,
      wakeWord as any,
      stt as any,
      {
        wakeWordCooldownMs: 1000,
      }
    );

    await va.start();

    // First non-listening chunk should be evaluated by wake word and trigger enableListening
    const chunk1 = Buffer.from([0, 0, 1, 0]); // 2 samples
    audioIn.emit(chunk1);
    await flushAsync();

    expect(wakeWord.processPcm).toHaveBeenCalled();
    expect(wakeEvent).toHaveBeenCalled();
    expect(audioOut.prepareTone).toHaveBeenCalledWith('listen-start', expect.any(Object));

    // Once listening, subsequent chunks should stream to STT
    const chunk2 = Buffer.from([2, 0, 3, 0]);
    audioIn.emit(chunk2);

    expect(stt.sendPcm).toHaveBeenCalledWith(chunk2);
  });
});
