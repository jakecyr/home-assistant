import { config } from 'dotenv';

config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
export const OPENAI_TEXT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const OPENAI_VOICE_MODEL = process.env.OPENAI_VOICE_MODEL || 'gpt-4o-mini-tts';
export const OPENAI_VOICE_NAME = process.env.OPENAI_VOICE_NAME || 'onyx';
export const PICOVOICE_ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY!;
export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;
export const AUDIO_DEVICE = process.env.AUDIO_DEVICE || 'default';
export const SERPAPI_KEY = process.env.SERPAPI_KEY!;
export let DEBUG_MODE = process.env.DEBUG_MODE === 'true';
export let AUTO_LISTEN = process.env.AUTO_LISTEN === 'true';

const cliArgs = process.argv.slice(2);
let configPathArg: string | undefined;
let logFileArg: string | undefined;

for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i];
  switch (arg) {
    case '--config':
      if (cliArgs[i + 1]) {
        configPathArg = cliArgs[++i];
      }
      break;
    case '--log-file':
      if (cliArgs[i + 1]) {
        logFileArg = cliArgs[++i];
      }
      break;
    case '--debug-tools':
      DEBUG_MODE = true;
      break;
    case '--no-debug-tools':
      DEBUG_MODE = false;
      break;
    case '--auto-listen':
      AUTO_LISTEN = true;
      break;
    case '--no-auto-listen':
      AUTO_LISTEN = false;
      break;
    default:
      break;
  }
}

export const CONFIG_PATH = configPathArg;
export const LOG_FILE = logFileArg;

if (process.env.npm_config_auto_listen) {
  AUTO_LISTEN = process.env.npm_config_auto_listen === 'true';
}

try {
  const npmArgv = process.env.npm_config_argv;
  if (npmArgv) {
    const parsed = JSON.parse(npmArgv);
    const original = Array.isArray(parsed?.original) ? parsed.original : [];
    for (const token of original) {
      if (token === '--auto-listen') AUTO_LISTEN = true;
      if (token === '--no-auto-listen') AUTO_LISTEN = false;
    }
  }
} catch (err) {
  if (process.env.DEBUG_MODE === 'true') {
    console.warn('Failed to parse npm_config_argv:', err);
  }
}
