import type { Tool } from "./_types";
import { resolveDevice } from "../config";
import { Client } from "tplink-smarthome-api";

const client = new Client();

type Action = "on" | "off" | "toggle";

const tplinkToggle: Tool = {
  name: "tplink_toggle",
  description:
    "Control TP-Link Kasa devices on your local network. Provide a device name from config or an IP address and desired action (on, off, or toggle).",
  parameters: {
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
  },
  async execute(args, ctx) {
    const deviceName = String(args.device || "").trim();
    if (!deviceName) {
      return { ok: false, message: "Device name is required" };
    }

    const host = resolveDevice(ctx.config.tplink?.devices, deviceName);
    if (!host) {
      return {
        ok: false,
        message:
          "Unknown TP-Link device. Update config.tplink.devices in config.json with name to IP mappings.",
      };
    }

    const action: Action = ["on", "off", "toggle"].includes(args.action)
      ? args.action
      : "toggle";

    try {
      const device = await client.getDevice({ host });
      let targetState: boolean;

      if (action === "toggle") {
        const current = await device.getPowerState();
        targetState = !current;
      } else {
        targetState = action === "on";
      }

      await device.setPowerState(targetState);

      const message = `TP-Link device ${deviceName} turned ${targetState ? "on" : "off"}.`;
      ctx.log(message);
      return { ok: true, message };
    } catch (err: any) {
      ctx.log("TP-Link control failed", err);
      return {
        ok: false,
        message: `Failed to control TP-Link device ${deviceName}: ${err?.message || err}`,
      };
    }
  },
};

export default tplinkToggle;
