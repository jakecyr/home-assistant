import { AssemblyAiSTT } from '../../../src/adapters/speech/AssemblyAiSTT';

// Simple EventEmitter mock
class Emitter {
  private listeners: Record<string, Function[]> = {};
  on(evt: string, cb: Function) { (this.listeners[evt] ||= []).push(cb); }
  emit(evt: string, ...args: any[]) { for (const f of (this.listeners[evt]||[])) { (f as any)(...args); } }
}

let lastTranscriber: any;
let lastEmitter: Emitter | null = null;

jest.mock('assemblyai', () => {
  return {
    AssemblyAI: jest.fn().mockImplementation(() => ({
      streaming: {
        transcriber: jest.fn((_opts: any) => {
          const em = new Emitter();
          lastEmitter = em;
          lastTranscriber = {
            connect: jest.fn(async () => { em.emit('open'); }),
            close: jest.fn(async () => {}),
            sendAudio: jest.fn(),
            on: (evt: string, cb: Function) => em.on(evt, cb),
          };
          return lastTranscriber;
        }),
      },
    })),
    StreamingTranscriber: class {},
  };
});

// Provide env api key indirectly through constructor; no need to mock env

describe('AssemblyAiSTT', () => {
  test('buffers audio until open, then flushes and emits transcripts on end_of_turn', async () => {
    const stt = new AssemblyAiSTT({ apiKey: 'aai', sampleRate: 16000 });
    const received: string[] = [];
    stt.onTranscript((t) => received.push(t));

    // Buffer enough audio to exceed minChunkBytes (1600 bytes at 16kHz)
    stt.sendPcm(Buffer.alloc(2000, 1));

    await stt.start(); // triggers connect -> 'open' via mock

    // After open, buffered audio should flush via sendAudio
    expect(lastTranscriber.sendAudio).toHaveBeenCalled();

    // Emit interim non-formatted
    lastEmitter!.emit('turn', {
      turn_order: 1,
      turn_is_formatted: false,
      end_of_turn: false,
      transcript: 'hel',
    });

    // Emit formatted end_of_turn
    lastEmitter!.emit('turn', {
      turn_order: 2,
      turn_is_formatted: true,
      end_of_turn: true,
      transcript: 'hello',
    });

    // Handler should receive best formatted transcript
    expect(received).toContain('hello');

    // Restart should attempt to close previous transcriber
    expect(lastTranscriber.close).toHaveBeenCalled();
  });
});
