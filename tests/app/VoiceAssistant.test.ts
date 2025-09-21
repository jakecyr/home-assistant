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
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    sendPcm: jest.fn(),
    onTranscript: jest.fn((cb: (t: string) => void) => { (makeStt as any)._cb = cb; }),
    _emitTranscript(text: string) { (makeStt as any)._cb?.(text); },
  } as any;
}

describe('VoiceAssistant', () => {
  test('auto-listen mode streams chunks to STT and publishes wake event on start', async () => {
    const bus = new SimpleEventBus();
    const audioIn = makeAudioIn();
    const stt = makeStt();

    const wakeEvent = jest.fn();
    bus.subscribe(Topics.WakeWordDetected, wakeEvent);

    const va = new VoiceAssistant(bus as any, audioIn as any, undefined, stt as any, {
      startListeningOnLaunch: true,
    });

    await va.start();

    // Auto-listen should have published a wake-like event to kick off
    expect(wakeEvent).toHaveBeenCalled();

    // Emulate incoming audio
    const chunk = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    audioIn.emit(chunk);

    expect(stt.sendPcm).toHaveBeenCalledWith(chunk);

    // Transcript received should publish UtteranceCaptured
    const utterHandler = jest.fn();
    bus.subscribe(Topics.UtteranceCaptured, utterHandler);

    stt._emitTranscript('  hello  ');

    expect(utterHandler).toHaveBeenCalledWith('hello');
  });

  test('wake-word mode triggers listening when detected and then streams to STT', async () => {
    const bus = new SimpleEventBus();
    const audioIn = makeAudioIn();
    const stt = makeStt();

    const wakeWord = {
      processPcm: jest.fn(() => true),
    } as any;

    const wakeEvent = jest.fn();
    bus.subscribe(Topics.WakeWordDetected, wakeEvent);

    const va = new VoiceAssistant(bus as any, audioIn as any, wakeWord as any, stt as any, {
      wakeWordCooldownMs: 1000,
    });

    await va.start();

    // First non-listening chunk should be evaluated by wake word and trigger enableListening
    const chunk1 = Buffer.from([0, 0, 1, 0]); // 2 samples
    audioIn.emit(chunk1);

    expect(wakeWord.processPcm).toHaveBeenCalled();
    expect(wakeEvent).toHaveBeenCalled();

    // Once listening, subsequent chunks should stream to STT
    const chunk2 = Buffer.from([2, 0, 3, 0]);
    audioIn.emit(chunk2);

    expect(stt.sendPcm).toHaveBeenCalledWith(chunk2);
  });
});
