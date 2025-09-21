import type { AppConfig } from "../../config";
import { resolveDevice } from "../../config";
import { humanize } from "../../deviceContext";
import type { ToolExecutionResult } from "../../ports/tools/ToolRegistryPort";
import { TplinkClient, type ToggleAction } from "../../adapters/devices/TplinkClient";

export interface TplinkToggleArgs {
  device: string;
  action?: ToggleAction;
}

export class TplinkToggleTool {
  readonly name = "tplink_toggle";
  readonly description =
    "Control TP-Link Kasa devices on your local network. Provide a device name from config or an IP address and desired action (on, off, or toggle).";

  readonly schema = {
    type: "object",
    properties: {
      device: {
        type: "string",
        description:
          "Friendly device name from config.tplink.devices or a direct IP address.",
      },
      action: {
        type: "string",
        enum: ["on", "off", "toggle"],
        description: "Action to perform (defaults to toggle).",
      },
    },
    required: ["device"],
    additionalProperties: false,
  };

  constructor(
    private readonly config: AppConfig,
    private readonly client: TplinkClient,
    private readonly log: (...args: any[]) => void
  ) {}

  async exec(args: TplinkToggleArgs): Promise<ToolExecutionResult> {
    const deviceName = String(args.device || "").trim();
    if (!deviceName) {
      return { ok: false, message: "Device name is required." };
    }

    const entry = resolveDevice(this.config.tplink?.devices, deviceName);
    if (!entry?.ip) {
      return {
        ok: false,
        message:
          "Unknown TP-Link device. Update config.tplink.devices in config.json with name to IP mappings.",
      };
    }

    const action: ToggleAction = ["on", "off", "toggle"].includes(args.action as ToggleAction)
      ? (args.action as ToggleAction)
      : "toggle";

    this.log(
      `[tplink_toggle] Request -> device:"${deviceName}" host:${entry.ip} room:${entry.room ?? "-"} action:${action}`
    );

    try {
      const state = await this.client.toggle(entry.ip, action);
      const message = `TP-Link device ${humanize(deviceName)} turned ${state ? "on" : "off"}.`;
      this.log(message);
      return { ok: true, message };
    } catch (err: any) {
      const message = err?.message || String(err);
      this.log("TP-Link control failed", err);
      return {
        ok: false,
        message,
      };
    }
  }
}
