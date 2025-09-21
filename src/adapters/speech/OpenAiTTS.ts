import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import type { TTSPort } from "../../ports/speech/TTSPort";
import { getOpenAI } from "../../openai";
import { OPENAI_VOICE_MODEL, OPENAI_VOICE_NAME } from "../../env";

export class OpenAiTTS implements TTSPort {
  async synthesize(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) {
      return this.createSilence();
    }

    const openai = getOpenAI();
    const speech = await openai.audio.speech.create({
      model: OPENAI_VOICE_MODEL,
      voice: OPENAI_VOICE_NAME,
      input: trimmed,
      response_format: "wav",
      instructions:
        "Speak in a friendly, helpful tone and mention that you are an AI assistant when relevant.",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    const filePath = path.join(tmpdir(), `assistant-tts-${randomUUID()}.wav`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  private async createSilence(): Promise<string> {
    const filePath = path.join(tmpdir(), `assistant-tts-silence-${randomUUID()}.wav`);
    const buffer = Buffer.alloc(44);
    buffer.write("RIFF", 0);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(24000, 24);
    buffer.writeUInt32LE(48000, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(0, 40);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }
}
