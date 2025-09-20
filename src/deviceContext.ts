import type { AppConfig } from "./config";

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
