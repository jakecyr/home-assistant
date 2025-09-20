import { config } from "dotenv";

config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
export const PICOVOICE_ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY!;
export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;
export const AUDIO_DEVICE = process.env.AUDIO_DEVICE || "default";
export const TTS_VOICE = process.env.TTS_VOICE || "onyx";
