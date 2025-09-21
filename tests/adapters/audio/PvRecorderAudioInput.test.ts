import { PvRecorderAudioInput } from '../../../src/adapters/audio/PvRecorderAudioInput';
jest.mock('@picovoice/pvrecorder-node', () => {
  const state = {
    start: jest.fn(),
    stop: jest.fn(),
    release: jest.fn(),
    isRecording: true,
    selectedDevice: 'Default Mic',
    reads: [] as Buffer[],
  };

  class PvRecorder {
    static getAvailableDevices() {
      return ['Built-in Mic', 'USB Mic'];
    }
    frameLength: number;
    deviceIndex: number;
    constructor(frameLength: number, deviceIndex: number) {
      this.frameLength = frameLength;
      this.deviceIndex = deviceIndex;
    }
    get isRecording() { return state.isRecording; }
    getSelectedDevice() { return state.selectedDevice; }
    start = state.start;
    stop = state.stop;
    release = state.release;
    async read() {
      const next = state.reads.shift() || Buffer.from([]);
      const pcm = new Int16Array(next.buffer, next.byteOffset, next.byteLength / 2);
      return pcm;
    }
  }

  (PvRecorder as any).__state = state;
  return { PvRecorder };
});

describe('PvRecorderAudioInput', () => {
  beforeEach(() => {
    const { PvRecorder } = require('@picovoice/pvrecorder-node');
    const state = (PvRecorder as any).__state as any;
    state.start.mockClear();
    state.stop.mockClear();
    state.release.mockClear();
    state.isRecording = true;
    state.selectedDevice = 'Default Mic';
    state.reads = [Buffer.from([1,0,2,0]), Buffer.from([3,0,4,0])];
  });

  test('start initializes recorder and pumps audio to handlers', async () => {
    const input = new PvRecorderAudioInput({ frameLength: 512 });
    const chunks: Buffer[] = [];
    input.onChunk((buf) => chunks.push(buf));
    await input.start();
    // Allow pump loop to run a bit
    await Promise.resolve();
    // Stop recording so loop exits
    const { PvRecorder } = require('@picovoice/pvrecorder-node');
    (PvRecorder as any).__state.isRecording = false;
    await Promise.resolve();

    const state = (require('@picovoice/pvrecorder-node').PvRecorder as any).__state;
    expect(state.start).toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
  });

  test('stop stops and releases', async () => {
    const input = new PvRecorderAudioInput({ frameLength: 256, deviceLabel: 'usb' });
    await input.start();
    await input.stop();
    const state = (require('@picovoice/pvrecorder-node').PvRecorder as any).__state;
    expect(state.stop).toHaveBeenCalled();
    expect(state.release).toHaveBeenCalled();
  });
});
