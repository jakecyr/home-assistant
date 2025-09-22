import type { AppConfig, DeviceEntry } from './config';

export function buildDeviceContextSummary(
  config: AppConfig,
  enabledTools: string[] = [],
): string | null {
  const sections: string[] = [];
  const enabled = new Set(enabledTools);

  if (enabled.has('tplink_toggle')) {
    const descriptors = buildDeviceDescriptors(config, enabledTools);
    if (descriptors.length) {
      const formatted = descriptors
        .map((device) => {
          const details: string[] = [];
          if (device.room) details.push(`room: ${device.room}`);
          if (device.aliases.length) {
            const aliasList = device.aliases.map((alias) => `"${alias}"`).join(', ');
            details.push(`aliases: ${aliasList}`);
          }
          if (details.length) {
            return `- ${device.name} (${details.join('; ')})`;
          }
          return `- ${device.name}`;
        })
        .join('\n');
      sections.push(
        `TP-Link devices available:\n${formatted}\nUse these names or aliases when controlling TP-Link plugs or bulbs.`,
      );
    }
  }

  if (!sections.length) return null;

  sections.push(
    'If the user refers to a light or plug, select the matching device name above when calling a tool. If a requested device name is missing, inform the user rather than pretending success.',
  );
  sections.push('Current date and time context: ' + new Date().toISOString());
  sections.push('Current timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone);

  return sections.join('\n');
}

export function getAllDeviceNames(config: AppConfig, enabledTools: string[] = []): string[] {
  const enabled = new Set(enabledTools);
  const names: string[] = [];
  if (enabled.has('tplink_toggle')) {
    names.push(...Object.keys(config.tplink?.devices ?? {}));
  }
  return names;
}

export interface DeviceDescriptor {
  name: string;
  ip: string;
  room?: string;
  tool: 'tplink_toggle';
  aliases: string[];
}

export function buildDeviceDescriptors(
  config: AppConfig,
  enabledTools: string[] = [],
): DeviceDescriptor[] {
  const out: DeviceDescriptor[] = [];
  const enabled = new Set(enabledTools);

  if (enabled.has('tplink_toggle')) {
    const devices = config.tplink?.devices ?? {};
    for (const [name, entry] of Object.entries(devices)) {
      const descriptor = createDescriptor(name, entry, 'tplink_toggle');
      if (descriptor) out.push(descriptor);
    }
  }

  return out;
}

function createDescriptor(
  name: string,
  entry: DeviceEntry,
  tool: 'tplink_toggle',
): DeviceDescriptor | null {
  if (!entry?.ip) return null;
  const aliasSet = new Set<string>();

  const normalizedName = name.toLowerCase();
  aliasSet.add(normalizedName);
  aliasSet.add(humanize(name).toLowerCase());

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
      aliasSet.add(`${room} ${humanize(name).toLowerCase()}`);
      aliasSet.add(`all ${room}`);
    }
  }

  const aliases = Array.from(aliasSet)
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias.length > 0);

  return {
    name,
    ip: entry.ip,
    room: entry.room,
    tool,
    aliases,
  };
}

export function inferActionFromText(text: string): 'on' | 'off' | 'toggle' | null {
  const lower = text.toLowerCase();
  if (/(turn|switch|shut|power)[^\n]*off|\boff\b/.test(lower)) {
    return 'off';
  }
  if (/(turn|switch|power)[^\n]*on|\bon\b/.test(lower)) {
    return 'on';
  }
  if (lower.includes('toggle') || lower.includes('flip')) {
    return 'toggle';
  }
  return null;
}

export function shouldContinueConversation(reply: string): boolean {
  if (!reply) return false;
  const normalized = reply.toLowerCase();
  if (reply.includes('?')) return true;
  if (
    normalized.match(/\b(say\s+yes|say\s+no|please\s+confirm|let\s+me\s+know|do\s+you\s+mean)\b/)
  ) {
    return true;
  }
  return false;
}

export function humanize(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
