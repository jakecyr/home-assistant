import { PlayerAudioOutput } from '../../../src/adapters/audio/PlayerAudioOutput';

jest.mock('child_process', () => {
  const { EventEmitter } = require('events');

  function makeProc({ autoFinish }: { autoFinish: boolean }) {
    const proc = new EventEmitter() as any;

    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      proc.emit('exit', 0, null);
      proc.emit('close', 0, null);
    };

    proc.stdin = {
      write: jest.fn(() => true),
      end: jest.fn(() => {
        queueMicrotask(finish);
      }),
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn(() => {
      queueMicrotask(finish);
      return true;
    });

    Object.defineProperty(proc, 'exitCode', { get: () => (closed ? 0 : null) });
    Object.defineProperty(proc, 'signalCode', { get: () => null });

    // For non-streaming `play(file.wav)` calls, auto-close next tick
    if (autoFinish) {
      setTimeout(finish, 0);
    }

    return proc;
  }

  return {
    spawnSync: jest.fn((cmd: string, args?: any[]) => {
      if (cmd === 'which' && Array.isArray(args)) {
        return { status: args[0] === 'ffplay' ? 0 : 1 } as any;
      }
      return { status: 0 } as any;
    }),
    spawn: jest.fn((_cmd: string, args: string[] = []) => {
      // Streaming: ffplay ... -i -
      // File playback: ffplay ... -i /path/to.wav
      const isStreaming = args.includes('-') && args[args.indexOf('-') - 1] === '-i';
      return makeProc({ autoFinish: !isStreaming });
    }),
  };
});

jest.mock('fs', () => ({ promises: { writeFile: jest.fn(async () => {}) } }));

describe('PlayerAudioOutput', () => {
  // Use fake timers by default, but some tests will opt out
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('play resolves when a player exists and exits 0', async () => {
    const out = new PlayerAudioOutput();
    const p = out.play('/tmp/file.wav');

    // Let queued microtasks run then flush timers (harmless)
    await Promise.resolve();
    jest.runOnlyPendingTimers();

    await expect(p).resolves.toBeUndefined();
  }, 5000);

  test('prepareTone caches by key and writes file', async () => {
    const out = new PlayerAudioOutput();
    const path1 = await out.prepareTone('ding', { frequency: 440, ms: 100 });
    const path2 = await out.prepareTone('ding', { frequency: 440, ms: 100 });
    expect(path1).toBe(path2);

    const { promises } = require('fs');
    expect(promises.writeFile).toHaveBeenCalledTimes(1);
  });

  test('playStream writes chunks to stdin when streaming supported', async () => {
    // IMPORTANT: the impl resolves on 'close' (microtask) -> real timers
    jest.useRealTimers();

    const { spawn } = require('child_process');
    const out = new PlayerAudioOutput();

    async function* gen() {
      yield Buffer.from([1, 2, 3, 4]);
    }

    const p = out.playStream(gen(), { sampleRate: 24000 });
    await expect(p).resolves.toBeUndefined();

    const results = (spawn as jest.Mock).mock.results;
    const proc = results[results.length - 1].value;
    expect(proc.stdin.write).toHaveBeenCalled();
    expect(proc.kill).not.toHaveBeenCalled(); // normal close path
  }, 10000);
});
