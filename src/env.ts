import { config } from "dotenv";

config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
export const OPENAI_TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const OPENAI_VOICE_MODEL = process.env.OPENAI_VOICE_MODEL!;
export const OPENAI_VOICE_NAME = process.env.OPENAI_VOICE_NAME!;
export const PICOVOICE_ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY!;
export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;
export const AUDIO_DEVICE = process.env.AUDIO_DEVICE || "default";
export const SERPAPI_KEY = process.env.SERPAPI_KEY!;
export let DEBUG_MODE = process.env.DEBUG_MODE === "true";

const cliArgs = process.argv.slice(2);
let configPathArg: string | undefined;
let logFileArg: string | undefined;

for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i];
  switch (arg) {
    case "--config":
      if (cliArgs[i + 1]) {
        configPathArg = cliArgs[++i];
      }
      break;
    case "--log-file":
      if (cliArgs[i + 1]) {
        logFileArg = cliArgs[++i];
      }
      break;
    case "--debug-tools":
      DEBUG_MODE = true;
      break;
    case "--no-debug-tools":
      DEBUG_MODE = false;
      break;
    default:
      break;
  }
}

export const CONFIG_PATH = configPathArg;
export const LOG_FILE = logFileArg;
