/**
 * @jest-environment node
 */
import path from 'node:path';

// We'll mock dotenv so importing your module doesn't read the real .env
jest.mock('dotenv', () => ({ config: jest.fn() }));

jest.mock('@picovoice/porcupine-node', () => ({
  Porcupine: jest.fn().mockImplementation(() => ({ release: jest.fn() })),
  BuiltinKeyword: { PICOVOICE: 'PICOVOICE' },
}));

// Helper to (re)load the module with controlled env/argv
const loadConfigModule = (opts?: { env?: Record<string, string | undefined>; argv?: string[] }) => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  process.env = { ...originalEnv } as NodeJS.ProcessEnv;
  if (opts?.env) {
    for (const [key, value] of Object.entries(opts.env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
  process.argv = [
    process.execPath,
    path.join(process.cwd(), 'fake-script.js'),
    ...(opts?.argv ?? []),
  ];

  jest.resetModules();

  const mod = require('../src/env');

  // restore
  process.env = originalEnv;
  process.argv = originalArgv;

  return mod;
};

describe('config.ts', () => {
  test('reads required env vars and default AUDIO_DEVICE', async () => {
    const mod = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk-test',
        OPENAI_VOICE_MODEL: 'gpt-voice-1',
        OPENAI_VOICE_NAME: 'alloy',
        PICOVOICE_ACCESS_KEY: 'pv-test',
        ASSEMBLYAI_API_KEY: 'aai-test',
        // AUDIO_DEVICE intentionally omitted -> should default to "default"
        SERPAPI_KEY: 'serp-test',
        DEBUG_MODE: 'false',
      },
    });

    expect(mod.OPENAI_API_KEY).toBe('sk-test');
    expect(mod.OPENAI_VOICE_MODEL).toBe('gpt-voice-1');
    expect(mod.OPENAI_VOICE_NAME).toBe('alloy');
    expect(mod.PICOVOICE_ACCESS_KEY).toBe('pv-test');
    expect(mod.ASSEMBLYAI_API_KEY).toBe('aai-test');
    expect(mod.SERPAPI_KEY).toBe('serp-test');

    // Default
    expect(mod.AUDIO_DEVICE).toBe('default');
    // Parsed from env (before CLI flags)
    expect(mod.DEBUG_MODE).toBe(false);

    // CLI-derived exports
    expect(mod.CONFIG_PATH).toBeUndefined();
    expect(mod.LOG_FILE).toBeUndefined();
  });

  test('AUDIO_DEVICE overrides default when set', async () => {
    const mod = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: 'm',
        OPENAI_VOICE_NAME: 'n',
        PICOVOICE_ACCESS_KEY: 'pv',
        ASSEMBLYAI_API_KEY: 'aai',
        SERPAPI_KEY: 'serp',
        AUDIO_DEVICE: 'hw:1,0',
      },
    });

    expect(mod.AUDIO_DEVICE).toBe('hw:1,0');
  });

  test('CLI flags set CONFIG_PATH and LOG_FILE', async () => {
    const mod = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: 'm',
        OPENAI_VOICE_NAME: 'n',
        PICOVOICE_ACCESS_KEY: 'pv',
        ASSEMBLYAI_API_KEY: 'aai',
        SERPAPI_KEY: 'serp',
      },
      argv: ['--config', './conf/local.json', '--log-file', './run.log'],
    });

    expect(mod.CONFIG_PATH).toBe('./conf/local.json');
    expect(mod.LOG_FILE).toBe('./run.log');
  });

  test('DEBUG_MODE precedence: env then CLI (last wins)', async () => {
    // Start with env=false but CLI turns it on
    const mod1 = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: 'm',
        OPENAI_VOICE_NAME: 'n',
        PICOVOICE_ACCESS_KEY: 'pv',
        ASSEMBLYAI_API_KEY: 'aai',
        SERPAPI_KEY: 'serp',
        DEBUG_MODE: 'false',
      },
      argv: ['--debug-tools'],
    });
    expect(mod1.DEBUG_MODE).toBe(true);

    // Start with env=true but CLI turns it off
    const mod2 = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: 'm',
        OPENAI_VOICE_NAME: 'n',
        PICOVOICE_ACCESS_KEY: 'pv',
        ASSEMBLYAI_API_KEY: 'aai',
        SERPAPI_KEY: 'serp',
        DEBUG_MODE: 'true',
      },
      argv: ['--no-debug-tools'],
    });
    expect(mod2.DEBUG_MODE).toBe(false);

    // Both flags present: last one wins
    const mod3 = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: 'm',
        OPENAI_VOICE_NAME: 'n',
        PICOVOICE_ACCESS_KEY: 'pv',
        ASSEMBLYAI_API_KEY: 'aai',
        SERPAPI_KEY: 'serp',
        DEBUG_MODE: 'false',
      },
      argv: ['--debug-tools', '--no-debug-tools'],
    });
    expect(mod3.DEBUG_MODE).toBe(false);
  });

  test('unknown CLI args are ignored', async () => {
    const mod = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: 'm',
        OPENAI_VOICE_NAME: 'n',
        PICOVOICE_ACCESS_KEY: 'pv',
        ASSEMBLYAI_API_KEY: 'aai',
        SERPAPI_KEY: 'serp',
      },
      argv: ['--wat', 'lol', '--still-ignored'],
    });

    expect(mod.CONFIG_PATH).toBeUndefined();
    expect(mod.LOG_FILE).toBeUndefined();
  });

  test("missing envs: exports exist but may be undefined at runtime (type non-null assertions don't throw)", async () => {
    // Provide only some envs to demonstrate behavior
    const mod = await loadConfigModule({
      env: {
        OPENAI_API_KEY: 'sk',
        OPENAI_VOICE_MODEL: undefined,
        OPENAI_VOICE_NAME: undefined,
        PICOVOICE_ACCESS_KEY: undefined,
        ASSEMBLYAI_API_KEY: undefined,
        SERPAPI_KEY: undefined,
        // omit others
      },
    });

    // Runtime reality: non-null assertion is only compile-time; values can be undefined.
    // Defaults for voice model/name exist in src/env.ts; others may be undefined.
    expect(mod.OPENAI_API_KEY).toBe('sk');
    expect(mod.OPENAI_VOICE_MODEL).toBe('gpt-4o-mini-tts');
    expect(mod.OPENAI_VOICE_NAME).toBe('onyx');
    expect(mod.PICOVOICE_ACCESS_KEY).toBeUndefined();
    expect(mod.ASSEMBLYAI_API_KEY).toBeUndefined();
    expect(mod.SERPAPI_KEY).toBeUndefined();
  });
});
