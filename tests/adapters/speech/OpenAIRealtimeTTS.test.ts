import { OpenAIRealtimeTTS } from '../../../src/adapters/speech/OpenAIRealtimeTTS';

// Mock env
jest.mock('../../../src/env', () => ({
  OPENAI_API_KEY: 'sk-test',
  OPENAI_VOICE_MODEL: 'gpt-realtime-tts',
  OPENAI_VOICE_NAME: 'ember',
}));

// Mock ws
let lastSocket: any;
jest.mock('ws', () => {
  return class MockWS {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = (this.constructor as any).OPEN;
    private _listeners: Record<string, Function[]> = {};
    constructor(url: string, opts: any) {
      lastSocket = this;
      setTimeout(() => this._emit('open'), 0);
    }
    on(evt: string, cb: Function) { (this._listeners[evt] ||= []).push(cb); }
    once(evt: string, cb: Function) {
      const wrap = (...args: any[]) => { this.off(evt, wrap); (cb as any)(...args); };
      this.on(evt, wrap);
    }
    off(evt: string, cb: Function) { this._listeners[evt] = (this._listeners[evt]||[]).filter(f => f!==cb); }
    private _emit(evt: string, ...args: any[]) { for (const f of (this._listeners[evt]||[])) { try { (f as any)(...args);} catch{} } }
    send(_data: any) {}
    close() { this.readyState = 3; setTimeout(() => this._emit('close'), 0); }
    // Expose for test to emit messages
    emit(evt: string, payload?: any) { this._emit(evt, payload); }
  } as any;
});

function b64(buf: Buffer) { return buf.toString('base64'); }

describe('OpenAIRealtimeTTS', () => {
  test('stream yields audio buffers until completion', async () => {
    const tts = new OpenAIRealtimeTTS('wss://example');
    const iter = await tts.stream('Hello');

    // Simulate server messages
    const pcm = Buffer.from([1,2,3,4]);
    // delta
    lastSocket.emit('message', Buffer.from(JSON.stringify({ type: 'response.output_audio.delta', delta: { audio: b64(pcm) } })));
    // complete
    lastSocket.emit('message', Buffer.from(JSON.stringify({ type: 'response.completed' })));

    const chunks: Buffer[] = [];
    for await (const chunk of iter) { chunks.push(chunk); }
    expect(chunks.length).toBe(1);
    expect(Buffer.isBuffer(chunks[0])).toBe(true);
  });

  test('empty text returns empty stream', async () => {
    const tts = new OpenAIRealtimeTTS();
    const iter = await tts.stream('   ');
    const chunks: Buffer[] = [];
    for await (const chunk of iter) { chunks.push(chunk); }
    expect(chunks.length).toBe(0);
  });
});
