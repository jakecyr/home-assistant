import { WeatherTool } from '../../src/features/WeatherTool';
import type { AppConfig } from '../../src/config';

describe('WeatherTool', () => {
  const originalFetch = global.fetch as any;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeTool(config: Partial<AppConfig> = {}) {
    return new WeatherTool(config as AppConfig);
  }

  test('fails when coordinates not provided and not in config', async () => {
    const tool = makeTool({});
    const res = await tool.exec({});
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Set latitude and longitude/);
  });

  test('uses provided coordinates and metric defaults; returns formatted message', async () => {
    const tool = makeTool({ weather: { latitude: 0, longitude: 0 } } as any);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 20.5,
          relative_humidity_2m: 55,
          wind_speed_10m: 10,
        },
      }),
    })) as any;

    const res = await tool.exec({ latitude: 42.36, longitude: -71.06, units: 'metric' });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Current temperature is 20.5°C, humidity 55% and wind 10 km\/h\./);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('imperial units adjust query and message units', async () => {
    const tool = makeTool({ weather: { latitude: 1, longitude: 2, units: 'imperial' } } as any);
    global.fetch = jest.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get('temperature_unit')).toBe('fahrenheit');
      expect(u.searchParams.get('wind_speed_unit')).toBe('mph');
      return {
        ok: true,
        json: async () => ({ current_weather: { temperature: 73, relative_humidity: 40, windspeed: 5 } }),
      } as any;
    }) as any;

    const res = await tool.exec({});
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/73°F/);
    expect(res.message).toMatch(/5 mph/);
  });

  test('handles HTTP error from weather service', async () => {
    const tool = makeTool({ weather: { latitude: 1, longitude: 2 } } as any);
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' })) as any;
    const res = await tool.exec({});
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Weather service error: 500 Server Error/);
  });

  test('handles missing current data shape', async () => {
    const tool = makeTool({ weather: { latitude: 1, longitude: 2 } } as any);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as any;
    const res = await tool.exec({});
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Weather data unavailable/);
  });
});
