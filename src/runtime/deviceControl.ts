import type { ToolRegistry } from "../tools";
import type { ToolContext } from "../tools/_types";
import type { AppConfig } from "../config";
import {
  buildDeviceDescriptors,
  inferActionFromText,
  humanize,
} from "../deviceContext";

export interface DirectControlResult {
  message: string;
  toolUsed: boolean;
}

export async function attemptDirectDeviceControl(
  transcript: string,
  config: AppConfig,
  enabledTools: string[],
  registry: ToolRegistry,
  ctx: ToolContext
): Promise<DirectControlResult | null> {
  const descriptors = buildDeviceDescriptors(config, enabledTools);
  if (!descriptors.length) return null;

  const lower = transcript.toLowerCase();
  const matches = new Map<string, (typeof descriptors)[number]>();

  for (const descriptor of descriptors) {
    for (const alias of descriptor.aliases) {
      if (alias && lower.includes(alias)) {
        matches.set(descriptor.name, descriptor);
        break;
      }
    }
  }

  if (!matches.size) return null;

  const matched = Array.from(matches.values());
  const action = inferActionFromText(transcript);

  if (!action) {
    const names = matched.map((d) => humanize(d.name));
    const list = names.join(" and ");
    const question =
      names.length > 1
        ? `Do you want me to turn the devices ${list} on or off?`
        : `Do you want me to turn ${list} on or off?`;
    return { message: question, toolUsed: false };
  }

  const responses: string[] = [];
  let anySuccess = false;

  for (const descriptor of matched) {
    if (!registry.names.includes(descriptor.tool)) {
      responses.push(
        `${humanize(descriptor.name)} can't be controlled because ${descriptor.tool} is disabled.`
      );
      continue;
    }

    const result = await registry.exec(
      descriptor.tool,
      { device: descriptor.name, action },
      ctx
    );

    if (result.ok) {
      anySuccess = true;
      responses.push(
        result.message ||
          `${humanize(descriptor.name)} turned ${
            action === "toggle" ? "on/off" : action
          }.`
      );
    } else {
      responses.push(
        result.message ||
          `Failed to control ${humanize(descriptor.name)}.`
      );
    }
  }

  if (!responses.length) return null;

  return {
    message: responses.join(" ").trim(),
    toolUsed: anySuccess,
  };
}
