import { SimpleEventBus } from "../src/adapters/sys/SimpleEventBus";
import { VoiceAssistant } from "../src/app/VoiceAssistant";
import { ConversationLoop } from "../src/app/ConversationLoop";
import { ToolOrchestrator } from "../src/app/ToolOrchestrator";
import type { LlmMessage } from "../src/app/LlmPort";

function makeAudioIn() {
  let handler: ((chunk: Buffer) => void) | null = null;
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    onChunk: jest.fn((h: (chunk: Buffer) => void) => {
      handler = h;
      return () => {
        handler = null;
      };
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

function makeWakeWord(always = true) {
  return {
    processPcm: jest.fn(() => always),
  } as any;
}

function makeLlmRespondOnce(action: any) {
  return {
    completeStructured: jest.fn(async (_messages: LlmMessage[]) => {
      return {
        assistantMessage: {
          role: "assistant",
          content: action.reply_text ?? "",
        },
        action,
      };
    }),
  } as any;
}

function makeEmptyTools() {
  return {
    list: jest.fn(() => []),
    exec: jest.fn(),
  } as any;
}

class NoopSpeechRenderer {
  render = jest.fn(async () => {});
}

async function flushAsync() {
  await new Promise((r) => setImmediate(r));
}

describe("E2E basic flow (wake-word -> command -> reply -> idle)", () => {
  test("returns to wake-word listening after reply", async () => {
    const bus = new SimpleEventBus();
    const audioIn = makeAudioIn();
    const stt = makeStt();
    const audioOut = makeAudioOut();
    const wakeWord = makeWakeWord(true);

    const tools = makeEmptyTools();
    const llm = makeLlmRespondOnce({
      reply_text: "Okay, done.",
      expect_user_response: false,
      tool_calls: [],
    });
    const orchestrator = new ToolOrchestrator(llm, tools);
    const speech = new NoopSpeechRenderer();

    const convo = new ConversationLoop(
      bus as any,
      orchestrator as any,
      speech as any,
      {
        systemPrompt: "test",
      }
    );
    convo.start();

    const va = new VoiceAssistant(
      bus as any,
      audioIn as any,
      audioOut as any,
      wakeWord as any,
      stt as any,
      { resumeListeningDelayMs: 0, wakeWordCooldownMs: 0 }
    );

    await va.start();

    // First chunk triggers wake word
    audioIn.emit(Buffer.from([1, 0, 2, 0]));
    await flushAsync();

    // Now streaming to STT, emit a transcript representing the user's command
    stt.emitTranscript("turn on the lamp");
    await flushAsync();

    // ConversationLoop should render a reply
    expect(speech.render).toHaveBeenCalledWith(
      expect.objectContaining({ reply_text: "Okay, done." })
    );

    // After reply, assistant should be idle (waiting for wake-word again)
    // Emitting a new chunk should NOT go straight to STT until wake-word fires again
    (stt.sendPcm as jest.Mock).mockClear();

    const postReplyChunk = Buffer.from([3, 0, 4, 0]);
    audioIn.emit(postReplyChunk); // idle path, wake-word gets a chance first
    await flushAsync();

    expect(stt.sendPcm).not.toHaveBeenCalled();
    expect(wakeWord.processPcm).toHaveBeenCalled();

    // First post-reply chunk after idle triggers wake-word; the NEXT chunk streams to STT
    audioIn.emit(postReplyChunk);
    const thirdChunk = Buffer.from([5, 0, 6, 0]);
    audioIn.emit(thirdChunk);
    expect(stt.sendPcm).toHaveBeenCalledWith(thirdChunk);
  });
});
