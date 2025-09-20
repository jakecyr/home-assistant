import fs from "fs";
import path from "path";

export type DeviceMap = Record<string, string>;

export interface WeatherConfig {
  latitude: number;
  longitude: number;
  units?: "metric" | "imperial";
  timezone?: string;
}

export interface AppConfig {
  tplink?: {
    devices: DeviceMap;
  };
  wiz?: {
    devices: DeviceMap;
  };
  weather?: WeatherConfig;
}

const DEFAULT_CONFIG_FILENAMES = ["config.json", "assistant.config.json"];

export interface LoadedConfig {
  config: AppConfig;
  path?: string;
}

export function loadConfig(configPath?: string): LoadedConfig {
  const searchPaths = configPath
    ? [configPath]
    : DEFAULT_CONFIG_FILENAMES.map((name) => path.resolve(process.cwd(), name));

  for (const candidate of searchPaths) {
    try {
      const resolved = path.resolve(candidate);
      if (!fs.existsSync(resolved)) continue;
      const raw = fs.readFileSync(resolved, "utf8");
      const parsed = JSON.parse(raw) as AppConfig;
      return { config: parsed, path: resolved };
    } catch (err) {
      console.warn(`Failed to load config from ${candidate}:`, err);
    }
  }

  return { config: {} };
}

export function resolveDevice(
  devices: DeviceMap | undefined,
  nameOrIp: string
): string | null {
  if (!nameOrIp) return null;
  if (devices && devices[nameOrIp]) return devices[nameOrIp];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(nameOrIp)) return nameOrIp;
  return null;
}
