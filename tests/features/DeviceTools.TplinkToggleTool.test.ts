import { TplinkToggleTool } from '../../src/features/DeviceTools/TplinkToggleTool';
import type { AppConfig } from '../../src/config';

function makeClient() {
  return {
    toggle: jest.fn(),
  } as any;
}

describe('TplinkToggleTool', () => {
  function makeConfig(devices: Record<string, any> = {}): AppConfig {
    return { tplink: { devices } } as any;
  }

  test('requires device name', async () => {
    const tool = new TplinkToggleTool(makeConfig(), makeClient(), jest.fn());
    const res = await tool.exec({} as any);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Device name is required/);
  });

  test('fails when device not found', async () => {
    const tool = new TplinkToggleTool(makeConfig({ known: { ip: '1.2.3.4' } }), makeClient(), jest.fn());
    const res = await tool.exec({ device: 'missing' });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Unknown TP-Link device/);
  });

  test('defaults action to toggle and logs request; success case', async () => {
    const client = makeClient();
    client.toggle.mockResolvedValueOnce(true);
    const log = jest.fn();
    const tool = new TplinkToggleTool(makeConfig({ lamp_one: { ip: '10.0.0.5', room: 'Bedroom' } }), client, log);

    const res = await tool.exec({ device: 'lamp_one' });

    expect(client.toggle).toHaveBeenCalledWith('10.0.0.5', 'toggle');
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/turned on|turned off/);
    // Should log request then message
    expect(log).toHaveBeenCalled();
  });

  test('passes explicit action and logs error on failure', async () => {
    const client = makeClient();
    const error = new Error('network down');
    client.toggle.mockRejectedValueOnce(error);
    const log = jest.fn();
    const tool = new TplinkToggleTool(makeConfig({ plug: { ip: '192.168.1.2' } }), client, log);

    const res = await tool.exec({ device: 'plug', action: 'off' });

    expect(client.toggle).toHaveBeenCalledWith('192.168.1.2', 'off');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('network down');
    expect(log).toHaveBeenCalledWith('TP-Link control failed', error);
  });
});
