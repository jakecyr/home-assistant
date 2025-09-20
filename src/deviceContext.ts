import type { AppConfig, DeviceEntry } from "./config";

export function buildDeviceContextSummary(
  config: AppConfig,
  enabledTools: string[] = []
): string | null {
  const sections: string[] = [];
  const enabled = new Set(enabledTools);

  const tplinkDevices = Object.keys(config.tplink?.devices ?? {});
  if (tplinkDevices.length && enabled.has("tplink_toggle")) {
    sections.push(
      `TP-Link devices available: ${tplinkDevices
        .map((name) => `"${name}"`)
        .join(", ")}. Use these names when controlling TP-Link plugs or bulbs.`
    );
  }

  const wizDevices = Object.keys(config.wiz?.devices ?? {});
  if (wizDevices.length && enabled.has("wiz_toggle")) {
    sections.push(
      `WiZ lights available: ${wizDevices
        .map((name) => `"${name}"`)
        .join(", ")}. Use these names when controlling WiZ lights.`
    );
  }

  if (!sections.length) return null;

  sections.push(
    "If the user refers to a light or plug, select the matching device name above when calling a tool. If a requested device name is missing, inform the user rather than pretending success."
  );

  return sections.join("\n");
}

export function getAllDeviceNames(
  config: AppConfig,
  enabledTools: string[] = []
): string[] {
  const enabled = new Set(enabledTools);
  const names: string[] = [];
  if (enabled.has("tplink_toggle")) {
    names.push(...Object.keys(config.tplink?.devices ?? {}));
  }
  if (enabled.has("wiz_toggle")) {
    names.push(...Object.keys(config.wiz?.devices ?? {}));
  }
  return names;
}

export interface DeviceDescriptor {
  name: string;
  ip: string;
  room?: string;
  tool: "tplink_toggle" | "wiz_toggle";
  aliases: string[];
}

export function buildDeviceDescriptors(
  config: AppConfig,
  enabledTools: string[] = []
): DeviceDescriptor[] {
  const out: DeviceDescriptor[] = [];
  const enabled = new Set(enabledTools);

  if (enabled.has("tplink_toggle")) {
    const devices = config.tplink?.devices ?? {};
    for (const [name, entry] of Object.entries(devices)) {
      const descriptor = createDescriptor(name, entry, "tplink_toggle");
      if (descriptor) out.push(descriptor);
    }
  }

  if (enabled.has("wiz_toggle")) {
    const devices = config.wiz?.devices ?? {};
    for (const [name, entry] of Object.entries(devices)) {
      const descriptor = createDescriptor(name, entry, "wiz_toggle");
      if (descriptor) out.push(descriptor);
    }
  }

  return out;
}

function createDescriptor(
  name: string,
  entry: DeviceEntry,
  tool: "tplink_toggle" | "wiz_toggle"
): DeviceDescriptor | null {
  if (!entry?.ip) return null;
  const aliasSet = new Set<string>();

  const normalizedName = name.toLowerCase();
  aliasSet.add(normalizedName);
  aliasSet.add(humanize(name));

  if (Array.isArray(entry.aliases)) {
    for (const alias of entry.aliases) {
      const value = alias?.toString().trim().toLowerCase();
      if (value) aliasSet.add(value);
    }
  }

  if (entry.room) {
    const room = entry.room.toString().trim().toLowerCase();
    if (room) {
      aliasSet.add(room);
      aliasSet.add(`${room} ${humanize(name)}`);
      aliasSet.add(`all ${room}`);
    }
  }

  const aliases = Array.from(aliasSet).filter((alias) => alias.length > 0);

  return {
    name,
    ip: entry.ip,
    room: entry.room,
    tool,
    aliases,
  };
}

export function inferActionFromText(
  text: string
): "on" | "off" | "toggle" | null {
  const lower = text.toLowerCase();
  if (/(turn|switch|shut|power)[^\n]*off|\boff\b/.test(lower)) {
    return "off";
  }
  if (/(turn|switch|power)[^\n]*on|\bon\b/.test(lower)) {
    return "on";
  }
  if (lower.includes("toggle") || lower.includes("flip")) {
    return "toggle";
  }
  return null;
}

export function shouldContinueConversation(reply: string): boolean {
  if (!reply) return false;
  const normalized = reply.toLowerCase();
  if (reply.includes("?")) return true;
  if (
    normalized.match(
      /\b(say\s+yes|say\s+no|please\s+confirm|let\s+me\s+know|do\s+you\s+mean)\b/
    )
  ) {
    return true;
  }
  return false;
}

export function humanize(name: string): string {
  return name.replace(/[_-]+/g, " ").trim().toLowerCase();
}
