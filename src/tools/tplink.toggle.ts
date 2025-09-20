import type { Tool } from "./_types";
import { resolveDevice } from "../config";
import dgram from "dgram";
import { Client } from "tplink-smarthome-api";

const client = new Client();

function encrypt(buffer: Buffer, key = 0xab): Buffer {
  const out = Buffer.allocUnsafe(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    out[i] = c ^ key;
    key = out[i];
  }
  return out;
}

function decrypt(buffer: Buffer, key = 0xab): Buffer {
  const out = Buffer.allocUnsafe(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    out[i] = c ^ key;
    key = c;
  }
  return out;
}

async function udpQuerySysInfo(host: string, timeoutMs = 500): Promise<any | null> {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  return new Promise((resolve) => {
    const cleanup = () => {
      try {
        socket.close();
      } catch {}
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    socket.once("message", (msg) => {
      clearTimeout(timer);
      try {
        const payload = JSON.parse(decrypt(msg).toString("utf8"));
        resolve(payload?.system?.get_sysinfo ?? null);
      } catch (err) {
        resolve(null);
      } finally {
        cleanup();
      }
    });

    socket.once("error", () => {
      clearTimeout(timer);
      cleanup();
      resolve(null);
    });

    const request = encrypt(Buffer.from('{"system":{"get_sysinfo":{}}}', "utf8"));
    socket.send(request, 0, request.length, 9999, host, () => {
      // response handled asynchronously or via timeout
    });
  });
}

async function udpSetPower(host: string, state: boolean, transition = 0) {
  const sysinfo = await udpQuerySysInfo(host);
  const socket = dgram.createSocket("udp4");

  const payload: Record<string, unknown> = {};

  if (sysinfo && typeof sysinfo.relay_state !== "undefined") {
    payload.system = {
      set_relay_state: {
        state: state ? 1 : 0,
      },
    };
  } else {
    payload["smartlife.iot.smartbulb.lightingservice"] = {
      transition_light_state: {
        ignore_default: 1,
        on_off: state ? 1 : 0,
        transition_period: transition,
      },
    };
    payload.system = {
      set_relay_state: {
        state: state ? 1 : 0,
      },
    };
  }

  const message = encrypt(Buffer.from(JSON.stringify(payload), "utf8"));

  await new Promise<void>((resolve, reject) => {
    socket.send(message, 0, message.length, 9999, host, (err) => {
      socket.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

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

    ctx.log(
      `[tplink_toggle] Request -> device:"${deviceName}" host:${host} action:${action}`
    );

    let lastError: any = null;
    let targetState: boolean | undefined;

    try {
      const device = await client.getDevice({ host });
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
    } catch (primaryErr: any) {
      lastError = primaryErr;
      ctx.log("Primary TP-Link control failed, attempting UDP fallback", primaryErr);
    }

    try {
      if (typeof targetState === "undefined") {
        const info = await udpQuerySysInfo(host);
        if (info && typeof info.relay_state === "number") {
          targetState = action === "toggle" ? info.relay_state === 0 : action === "on";
        } else {
          targetState = action === "toggle" ? true : action === "on";
        }
      }
      await udpSetPower(host, targetState);
      const message = `TP-Link device ${deviceName} (UDP fallback) turned ${targetState ? "on" : "off"}.`;
      ctx.log(message);
      return { ok: true, message };
    } catch (fallbackErr: any) {
      ctx.log("TP-Link UDP fallback failed", fallbackErr);
      return {
        ok: false,
        message: `Failed to control TP-Link device ${deviceName}: ${fallbackErr?.message || fallbackErr || lastError}`,
      };
    }
  },
};

export default tplinkToggle;
