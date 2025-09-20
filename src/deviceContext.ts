import type { AppConfig } from "./config";

export function buildDeviceContextSummary(config: AppConfig): string | null {
  const sections: string[] = [];

  const tplinkDevices = Object.keys(config.tplink?.devices ?? {});
  if (tplinkDevices.length) {
    sections.push(
      `TP-Link devices available: ${tplinkDevices
        .map((name) => `"${name}"`)
        .join(", ")}. Use these names when controlling TP-Link plugs or bulbs.`
    );
  }

  const wizDevices = Object.keys(config.wiz?.devices ?? {});
  if (wizDevices.length) {
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

export function getAllDeviceNames(config: AppConfig): string[] {
  return [
    ...Object.keys(config.tplink?.devices ?? {}),
    ...Object.keys(config.wiz?.devices ?? {}),
  ];
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
