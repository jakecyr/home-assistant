import { attemptDirectDeviceControl } from '../src/runtime/deviceControl';
import type { AppConfig } from '../src/config';
import type { ToolRegistry } from '../src/tools';
import type { ToolContext } from '../src/tools/_types';

describe('attemptDirectDeviceControl', () => {
  const baseConfig: AppConfig = {
    tplink: {
      devices: {
        tall_lamp: {
          ip: '192.168.1.20',
          room: 'living room',
          aliases: ['floor lamp'],
        },
        desk_lamp: {
          ip: '192.168.1.21',
          room: 'office',
        },
      },
    },
  };

  const ctx: ToolContext = {
    log: jest.fn(),
    config: baseConfig,
    env: {},
  };

  test('returns null when no matches', async () => {
    const registry: ToolRegistry = {
      specs: [],
      names: ['tplink_toggle'],
      exec: jest.fn(),
    };

    const result = await attemptDirectDeviceControl(
      'play some music',
      baseConfig,
      ['tplink_toggle'],
      registry,
      ctx,
    );
    expect(result).toBeNull();
    expect(registry.exec).not.toHaveBeenCalled();
  });

  test('asks for clarification when action missing', async () => {
    const registry: ToolRegistry = {
      specs: [],
      names: ['tplink_toggle'],
      exec: jest.fn(),
    };

    const result = await attemptDirectDeviceControl(
      'the tall lamp please',
      baseConfig,
      ['tplink_toggle'],
      registry,
      ctx,
    );
    expect(result).not.toBeNull();
    expect(result?.toolUsed).toBe(false);
    expect(result?.message).toMatch(/turn.*on or off/i);
    expect(registry.exec).not.toHaveBeenCalled();
  });

  test('executes tool when action is found', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue({ ok: true, message: 'Lamp off.' });
    const registry: ToolRegistry = {
      specs: [],
      names: ['tplink_toggle'],
      exec,
    };

    const result = await attemptDirectDeviceControl(
      'turn off the floor lamp in the living room',
      baseConfig,
      ['tplink_toggle'],
      registry,
      ctx,
    );
    expect(exec).toHaveBeenCalledWith(
      'tplink_toggle',
      { device: 'tall_lamp', action: 'off' },
      ctx,
    );
    expect(result?.toolUsed).toBe(true);
    expect(result?.message).toMatch(/lamp off/i);
  });

  test('controls multiple devices based on room alias', async () => {
    const config: AppConfig = {
      tplink: {
        devices: {
          tall_lamp: { ip: '192.168.1.20', room: 'living room' },
          sofa_light: { ip: '192.168.1.22', room: 'living room' },
        },
      },
    };
    const exec = jest
      .fn()
      .mockResolvedValue({ ok: true, message: 'done' });
    const registry: ToolRegistry = {
      specs: [],
      names: ['tplink_toggle'],
      exec,
    };

    const result = await attemptDirectDeviceControl(
      'turn off the living room lights',
      config,
      ['tplink_toggle'],
      registry,
      ctx,
    );
    expect(exec).toHaveBeenCalledTimes(2);
    expect(result?.toolUsed).toBe(true);
  });
});
