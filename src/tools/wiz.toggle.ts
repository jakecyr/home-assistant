import dgram from "dgram";
import type { Tool } from "./_types";
import { resolveDevice } from "../config";

const WIZ_PORT = 38899;

async function sendWizCommand(host: string, payload: Record<string, unknown>) {
  const socket = dgram.createSocket("udp4");

  return new Promise<void>((resolve, reject) => {
    const message = Buffer.from(JSON.stringify(payload), "utf8");

    const timeout = setTimeout(() => {
      socket.close();
      resolve();
    }, 500);

    socket.once("error", (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    socket.once("message", () => {
      clearTimeout(timeout);
      socket.close();
      resolve();
    });

    socket.send(message, WIZ_PORT, host, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      }
    });
  });
}

async function getWizState(host: string) {
  const socket = dgram.createSocket("udp4");

  return new Promise<{ state?: boolean; dimming?: number } | null>((resolve) => {
    const message = Buffer.from(JSON.stringify({ method: "getPilot" }), "utf8");

    const timeout = setTimeout(() => {
      socket.close();
      resolve(null);
    }, 500);

    socket.once("message", (msg) => {
      clearTimeout(timeout);
      socket.close();
      try {
        const data = JSON.parse(msg.toString());
        const params = data?.result ?? data?.params ?? {};
        resolve({ state: params.state, dimming: params.dimming });
      } catch (err) {
        resolve(null);
      }
    });

    socket.once("error", () => {
      clearTimeout(timeout);
      socket.close();
      resolve(null);
    });

    socket.send(message, WIZ_PORT, host, () => {
      // no-op; response handled via "message"
    });
  });
}

const wizToggle: Tool = {
  name: "wiz_toggle",
  description:
    "Control Philips WiZ bulbs via local network. Provide a device name from config or an IP address, plus optional brightness.",
  parameters: {
    type: "object",
    properties: {
      device: {
        type: "string",
        description:
          "Friendly device name from config.wiz.devices or a direct IP address.",
      },
      action: {
        type: "string",
        enum: ["on", "off", "toggle"],
        description: "Action to perform. Defaults to toggle.",
      },
      brightness: {
        type: "number",
        minimum: 1,
        maximum: 100,
        description: "Optional brightness percentage (1-100).",
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

    const host = resolveDevice(ctx.config.wiz?.devices, deviceName);
    if (!host) {
      return {
        ok: false,
        message:
          "Unknown WiZ device. Add it to config.wiz.devices with a name to IP mapping.",
      };
    }

    const action: string = ["on", "off", "toggle"].includes(args.action)
      ? args.action
      : "toggle";

    try {
      let desiredState: boolean;
      let desiredDimming: number | undefined = undefined;

      if (typeof args.brightness === "number") {
        desiredDimming = Math.max(1, Math.min(100, Math.round(args.brightness)));
      }

      if (action === "toggle") {
        const current = await getWizState(host);
        desiredState = !(current?.state ?? false);
        if (desiredDimming === undefined && typeof current?.dimming === "number") {
          desiredDimming = current.dimming;
        }
      } else {
        desiredState = action === "on";
      }

      const params: Record<string, unknown> = { state: desiredState };
      if (desiredDimming !== undefined) params.dimming = desiredDimming;

      await sendWizCommand(host, { method: "setPilot", params });
      const message = `WiZ light ${deviceName} set ${desiredState ? "on" : "off"}${
        desiredDimming ? ` at ${desiredDimming}%` : ""
      }.`;
      ctx.log(message);
      return { ok: true, message };
    } catch (err: any) {
      ctx.log("WiZ control failed", err);
      return {
        ok: false,
        message: `Failed to control WiZ device ${deviceName}: ${err?.message || err}`,
      };
    }
  },
};

export default wizToggle;
