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

function makeFollowupLlm() {
  // First assistant action expects a user response; second concludes.
  const calls: any[] = [
    {
      reply_text: "Sure, which room?",
      expect_user_response: true,
      tool_calls: [],
    },
    {
      reply_text: "Okay, turning on the living room lamp.",
      expect_user_response: false,
      tool_calls: [],
    },
  ];
  return {
    completeStructured: jest.fn(async (_messages: LlmMessage[]) => {
      const action = calls.shift() ?? {
        reply_text: "done",
        expect_user_response: false,
        tool_calls: [],
      };
      return {
        assistantMessage: { role: "assistant", content: action.reply_text },
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

describe("E2E follow-up flow (auto-listen: reply expects user response -> follow-up)", () => {
  test("resumes listening automatically and processes follow-up utterance", async () => {
    const bus = new SimpleEventBus();
    const audioIn = makeAudioIn();
    const stt = makeStt();
    const audioOut = makeAudioOut();

    const tools = makeEmptyTools();
    const llm = makeFollowupLlm();
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

    // No wake word adapter provided: use auto-listen, and resume immediately when speaking stops
    const va = new VoiceAssistant(
      bus as any,
      audioIn as any,
      audioOut as any,
      undefined,
      stt as any,
      { startListeningOnLaunch: true, resumeListeningDelayMs: 0 }
    );

    await va.start();
    await flushAsync();

    // First chunk starts auto-listen to STT
    const chunk1 = Buffer.from([1, 0, 2, 0]);
    audioIn.emit(chunk1);
    expect(stt.sendPcm).toHaveBeenCalledWith(chunk1);

    // First user utterance -> assistant asks a follow-up question
    stt.emitTranscript("turn on the lamp");
    await flushAsync();

    expect(speech.render).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ reply_text: "Sure, which room?" })
    );

    // After speaking stops, auto-listen should resume immediately and stream next chunks
    (stt.sendPcm as jest.Mock).mockClear();
    const chunk2 = Buffer.from([3, 0, 4, 0]);
    audioIn.emit(chunk2);
    expect(stt.sendPcm).toHaveBeenCalledWith(chunk2);

    // Follow-up user utterance arrives
    stt.emitTranscript("living room");
    await flushAsync();

    // Assistant replies and concludes
    expect(speech.render).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        reply_text: "Okay, turning on the living room lamp.",
      })
    );
  });
});
