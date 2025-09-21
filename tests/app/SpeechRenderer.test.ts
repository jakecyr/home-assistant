import { SpeechRenderer } from '../../src/app/SpeechRenderer';

function makeAudioOutWithStream() {
  return {
    play: jest.fn().mockResolvedValue(undefined),
    playStream: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeAudioOutNoStream() {
  return {
    play: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeRealtimeTts() {
  return {
    stream: jest.fn(),
  } as any;
}

function makeFallbackTts() {
  return {
    synthesize: jest.fn(),
  } as any;
}

describe('SpeechRenderer', () => {
  test('logs and returns when voice disabled', async () => {
    const audioOut = makeAudioOutWithStream();
    const realtime = makeRealtimeTts();
    const fallback = makeFallbackTts();

    const sr = new SpeechRenderer(audioOut, realtime, fallback, { voiceEnabled: false });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await sr.render({ reply_text: 'Hello', expect_user_response: false, tool_calls: [] });

    expect(logSpy).toHaveBeenCalled();
    expect(audioOut.play).not.toHaveBeenCalled();
    expect(audioOut.playStream).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('uses realtime TTS and playStream when available', async () => {
    const audioOut = makeAudioOutWithStream();
    const realtime = makeRealtimeTts();
    const fallback = makeFallbackTts();

    const fakeStream: any = { readable: true };
    realtime.stream.mockResolvedValue(fakeStream);

    const sr = new SpeechRenderer(audioOut, realtime, fallback, { voiceEnabled: true, sampleRate: 22050 });

    await sr.render({ reply_text: 'Hi there', expect_user_response: false, tool_calls: [] });

    expect(realtime.stream).toHaveBeenCalledWith('Hi there');
    expect(audioOut.playStream).toHaveBeenCalledWith(fakeStream, { sampleRate: 22050 });
    expect(audioOut.play).not.toHaveBeenCalled();
  });

  test('falls back to file synthesize and cleans up temp file', async () => {
    const audioOut = makeAudioOutNoStream();
    const realtime = makeRealtimeTts();
    const fallback = makeFallbackTts();

    fallback.synthesize.mockResolvedValue('/tmp/test.wav');

    const sr = new SpeechRenderer(audioOut, realtime, fallback, { voiceEnabled: true });

    // Spy on fs.promises.unlink used internally
    const fs = require('fs');
    const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);

    await sr.render({ reply_text: 'Hello world', expect_user_response: false, tool_calls: [] });

    expect(fallback.synthesize).toHaveBeenCalledWith('Hello world');
    expect(audioOut.play).toHaveBeenCalledWith('/tmp/test.wav');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/test.wav');

    unlinkSpy.mockRestore();
  });

  test('realtime TTS failure triggers fallback path', async () => {
    const audioOut = makeAudioOutWithStream();
    const realtime = makeRealtimeTts();
    const fallback = makeFallbackTts();

    realtime.stream.mockRejectedValue(new Error('realtime down'));
    fallback.synthesize.mockResolvedValue('/tmp/fallback.wav');

    const sr = new SpeechRenderer(audioOut, realtime, fallback, { voiceEnabled: true });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fs = require('fs');
    const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);

    await sr.render({ reply_text: 'Talk', expect_user_response: false, tool_calls: [] });

    expect(warnSpy).toHaveBeenCalled();
    expect(fallback.synthesize).toHaveBeenCalled();
    expect(audioOut.play).toHaveBeenCalledWith('/tmp/fallback.wav');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/fallback.wav');

    warnSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});
