import { loadConfig } from '../config/AppConfig';
import {
  CONFIG_PATH,
  PICOVOICE_ACCESS_KEY,
  ASSEMBLYAI_API_KEY,
  AUDIO_DEVICE,
  SERPAPI_KEY,
  AUTO_LISTEN,
  OPENAI_VOICE_MODEL,
  OPENAI_VOICE_NAME,
} from '../env';
import { SimpleEventBus } from '../adapters/sys/SimpleEventBus';
import { NodeTime } from '../adapters/sys/NodeTime';
import { PlayerAudioOutput } from '../adapters/audio/PlayerAudioOutput';
import { PorcupineWakeWord } from '../adapters/speech/PorcupineWakeWord';
import { AssemblyAiSTT } from '../adapters/speech/AssemblyAiSTT';
import { OpenAiTTS } from '../adapters/speech/OpenAiTTS';
import { OpenAIRealtimeTTS } from '../adapters/speech/OpenAIRealtimeTTS';
import { NodeTimerService } from '../adapters/sys/NodeTimerService';
import { AlarmManager } from '../app/AlarmManager';
import { OpenAiLlmAdapter } from '../adapters/tools/OpenAiLlmAdapter';
import { ConversationLoop } from '../app/ConversationLoop';
import { shouldContinueConversation, buildDeviceContextSummary } from '../deviceContext';
import { VoiceAssistant } from '../app/VoiceAssistant';
import { PvRecorderAudioInput } from '../adapters/audio/PvRecorderAudioInput';
import { Topics } from '../domain/events/EventBus';
import { ToolOrchestrator } from '../app/ToolOrchestrator';
import { FunctionToolRegistry, type FunctionTool } from '../adapters/tools/FunctionToolRegistry';
import { SetTimerTool } from '../features/TimerTools/SetTimerTool';
import { TimeNowTool } from '../features/TimeTools/TimeNowTool';
import { WeatherTool } from '../features/WeatherTool';
import { WebSearchTool } from '../features/WebSearchTool';
import { TplinkToggleTool } from '../features/DeviceTools/TplinkToggleTool';
import { TplinkClient } from '../adapters/devices/TplinkClient';
import { SerpApiSearch } from '../adapters/search/SerpApiSearch';
import { SpeechRenderer } from '../app/SpeechRenderer';

export interface ApplicationInstance {
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

export async function buildApplication(): Promise<ApplicationInstance> {
  const { config: appConfig, path: configPath } = loadConfig(CONFIG_PATH);
  if (configPath) {
    console.log(`Loaded config from ${configPath}`);
  }

  if (AUTO_LISTEN) {
    console.log('Auto-listen enabled: start speaking when you are ready.');
  }

  const bus = new SimpleEventBus();
  const time = new NodeTime();
  const audioOut = new PlayerAudioOutput();
  const useWakeWord = !AUTO_LISTEN;
  let wakeWord: PorcupineWakeWord | null = null;
  if (useWakeWord) {
    try {
      wakeWord = new PorcupineWakeWord({
        accessKey: PICOVOICE_ACCESS_KEY,
        keyword: 'jarvis',
      });
    } catch (err) {
      console.warn(
        'Wake-word initialization failed; falling back to immediate listening.',
        err,
      );
      wakeWord = null;
    }
  }
  const frameLength = wakeWord ? wakeWord.frameLength : 512;
  const audioIn = new PvRecorderAudioInput({
    deviceLabel: AUDIO_DEVICE,
    frameLength,
  });
  const stt = new AssemblyAiSTT({ apiKey: ASSEMBLYAI_API_KEY });
  const tts = new OpenAiTTS();
  const realtimeTts = new OpenAIRealtimeTTS();
  const timerService = new NodeTimerService();

  const defaultToolNames = [
    'timer_set',
    'time_now',
    'weather_current',
    'tplink_toggle',
    'web_search',
  ];

  const configuredToolNames = Array.isArray(appConfig.tools)
    ? Array.from(
        new Set(
          appConfig.tools
            .map((name) => (typeof name === 'string' ? name.trim() : ''))
            .filter((name) => name.length > 0),
        ),
      )
    : defaultToolNames;

  const enabledToolNames = new Set(
    configuredToolNames.length ? configuredToolNames : defaultToolNames,
  );
  enabledToolNames.add('timer_set');

  const toolLog = (...args: any[]) => console.log('[tool]', ...args);
  const functionTools: FunctionTool[] = [];

  const registerTool = (
    tool: { name: string; description: string; schema: any },
    exec: (args: any) => Promise<any>,
  ) => {
    if (!enabledToolNames.has(tool.name)) return;
    functionTools.push({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      exec,
    });
  };

  const timerTool = new SetTimerTool(timerService, time);
  registerTool(timerTool, (args) => timerTool.exec(args));

  const timeTool = new TimeNowTool(time);
  registerTool(timeTool, (args) => timeTool.exec(args));

  const weatherTool = new WeatherTool(appConfig);
  registerTool(weatherTool, (args) => weatherTool.exec(args));

  const tplinkTool = new TplinkToggleTool(appConfig, new TplinkClient(), toolLog);
  registerTool(tplinkTool, (args) => tplinkTool.exec(args));

  const searchTool = new WebSearchTool(new SerpApiSearch({ apiKey: SERPAPI_KEY }));
  registerTool(searchTool, (args) => searchTool.exec(args));

  const tools = new FunctionToolRegistry(functionTools);

  const llm = new OpenAiLlmAdapter();
  const orchestrator = new ToolOrchestrator(llm, tools);

  const extraContext = buildDeviceContextSummary(appConfig, Array.from(enabledToolNames));
  const systemPrompt = buildSystemPrompt(extraContext);

  const voiceEnabled = Boolean(OPENAI_VOICE_MODEL && OPENAI_VOICE_NAME);
  const speechRenderer = new SpeechRenderer(audioOut, realtimeTts, tts, {
    voiceEnabled,
  });

  const conversationLoop = new ConversationLoop(bus, orchestrator, speechRenderer, {
    systemPrompt,
    continueConversation: shouldContinueConversation,
  });

  const audioAssistant = new VoiceAssistant(
    bus,
    audioIn,
    audioOut,
    wakeWord ?? undefined,
    stt,
    {
      startListeningOnLaunch: AUTO_LISTEN || !wakeWord,
    }
  );

  const alarmManager = new AlarmManager(bus, audioOut, time, {
    toneFrequency: 880,
    toneDurationMs: 700,
    pauseMs: 150,
  });
  alarmManager.wire();

  timerService.onFinished((timer) => {
    bus.publish(Topics.TimerFinished, timer);
  });

  return {
    start: async () => {
      conversationLoop.start();
      await audioAssistant.start();
      console.log('Assistant ready.');
    },
    shutdown: async () => {
      await audioAssistant.stop();
      await stt.stop().catch(() => {});
      wakeWord?.dispose();
    },
  };
}

function buildSystemPrompt(extraContext: string | null): string {
  const base = `You are Jarvis, a voice agent on a Raspberry Pi.
Only respond when the user is clearly addressing you. If the transcript sounds like background chatter, off-topic speech, or another conversation, politely ignore it with a very brief acknowledgement like "No problem, I'll stay quiet." and wait for more input.
When the user asks to control lights, plugs, or other smart devices you MUST invoke the appropriate tool. Never claim success without calling a tool. If you cannot match the requested device to one of the known names, tell the user the device is not configured and ask for clarification.
When the user asks to set a timer, call the timer tool with the provided duration components (hours/minutes/seconds). Confirm the timer length and when it will end.
Always respond as JSON conforming to the AssistantAction schema with fields: reply_text (string), optional speak_ssml (string), optional tool_calls (array of {name, arguments}), expect_user_response (boolean), optional metadata.
When tools are available, decide if any are needed. If you call tools, wait for their results before replying to the user.
Be concise. If no tools are needed, reply directly to the user.`;
  if (extraContext) {
    return `${base}\n\n${extraContext}`;
  }
  return base;
}
