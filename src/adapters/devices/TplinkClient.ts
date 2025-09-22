import dgram from "dgram";
import { Client } from "tplink-smarthome-api";

export type ToggleAction = "on" | "off" | "toggle";

const tplinkClient = new Client();

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

export class TplinkClient {
  async toggle(host: string, action: ToggleAction): Promise<boolean> {
    let targetState: boolean | undefined;
    let lastError: unknown = null;

    try {
      const device = await tplinkClient.getDevice({ host });
      if (action === "toggle") {
        const current = await device.getPowerState();
        targetState = !current;
      } else {
        targetState = action === "on";
      }

      await device.setPowerState(targetState);
      return targetState;
    } catch (err) {
      lastError = err;
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
      return Boolean(targetState);
    } catch (err) {
      throw new Error(
        `Failed to control TP-Link device at ${host}: ${
          (err as Error)?.message || err || (lastError as Error)?.message || lastError
        }`
      );
    }
  }
}
