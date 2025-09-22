import { TplinkClient } from '../../../src/adapters/devices/TplinkClient';

jest.mock('tplink-smarthome-api', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      getDevice: jest.fn(async () => ({
        getPowerState: jest.fn(async () => false),
        setPowerState: jest.fn(async () => {}),
      })),
    })),
  };
});

describe('TplinkClient', () => {
  test('toggle uses API client to invert power state and returns new state', async () => {
    const client = new TplinkClient();
    const result = await client.toggle('192.168.1.2', 'toggle');
    expect(result).toBe(true);
  });
});
