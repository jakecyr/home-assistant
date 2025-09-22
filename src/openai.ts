import OpenAI from 'openai';
import { OPENAI_API_KEY } from './env';

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing. Set it in your environment.');
  }
  _client = new OpenAI({ apiKey: OPENAI_API_KEY });
  return _client;
}
