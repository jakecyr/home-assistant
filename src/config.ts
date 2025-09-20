import fs from "fs";
import path from "path";

export interface DeviceEntry {
  ip: string;
  room?: string;
  aliases?: string[];
}

export type RawDeviceValue = string | Partial<DeviceEntry>;
export type DeviceMap = Record<string, DeviceEntry>;

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
  tools?: string[];
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
      const normalized: AppConfig = { ...parsed };

      if (parsed.tplink?.devices) {
        normalized.tplink = {
          devices: normalizeDevices(parsed.tplink.devices as Record<string, RawDeviceValue>),
        };
      }

      if (parsed.wiz?.devices) {
        normalized.wiz = {
          devices: normalizeDevices(parsed.wiz.devices as Record<string, RawDeviceValue>),
        };
      }

      return { config: normalized, path: resolved };
    } catch (err) {
      console.warn(`Failed to load config from ${candidate}:`, err);
    }
  }

  return { config: {} };
}

export function resolveDevice(
  devices: DeviceMap | undefined,
  nameOrIp: string
): DeviceEntry | null {
  if (!nameOrIp) return null;
  if (devices && devices[nameOrIp]) return devices[nameOrIp];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(nameOrIp)) return { ip: nameOrIp };
  return null;
}

function normalizeDevices(
  input: Record<string, RawDeviceValue> | undefined
): DeviceMap {
  const out: DeviceMap = {};
  if (!input) return out;

  for (const [name, value] of Object.entries(input)) {
    if (typeof value === "string") {
      out[name] = { ip: value };
      continue;
    }

    if (value && typeof value.ip === "string") {
      out[name] = {
        ip: value.ip,
        room: value.room,
        aliases: Array.isArray(value.aliases)
          ? value.aliases
              .map((alias) =>
                typeof alias === "string" ? alias.trim() : String(alias)
              )
              .filter((alias) => alias.length > 0)
          : undefined,
      };
      continue;
    }

    console.warn(
      `Invalid device configuration for "${name}"; expected string or object with ip.`
    );
  }

  return out;
}
