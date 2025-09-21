import dgram from 'dgram';

const WIZ_PORT = 38899;

export type WizAction = 'on' | 'off' | 'toggle';

async function sendWizCommand(host: string, payload: Record<string, unknown>) {
  const socket = dgram.createSocket('udp4');

  return new Promise<void>((resolve, reject) => {
    const message = Buffer.from(JSON.stringify(payload), 'utf8');

    const timeout = setTimeout(() => {
      socket.close();
      resolve();
    }, 500);

    socket.once('error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    socket.once('message', () => {
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
  const socket = dgram.createSocket('udp4');

  return new Promise<{ state?: boolean; dimming?: number } | null>((resolve) => {
    const message = Buffer.from(JSON.stringify({ method: 'getPilot' }), 'utf8');

    const timeout = setTimeout(() => {
      socket.close();
      resolve(null);
    }, 500);

    socket.once('message', (msg) => {
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

    socket.once('error', () => {
      clearTimeout(timeout);
      socket.close();
      resolve(null);
    });

    socket.send(message, WIZ_PORT, host, () => {
      // fire and forget
    });
  });
}

export class WizClient {
  async toggle(
    host: string,
    action: WizAction,
    brightness?: number
  ): Promise<{ state: boolean; dimming?: number }> {
    let desiredState: boolean;
    let desiredDimming: number | undefined;

    if (typeof brightness === 'number' && Number.isFinite(brightness)) {
      desiredDimming = Math.max(1, Math.min(100, Math.round(brightness)));
    }

    if (action === 'toggle') {
      const current = await getWizState(host);
      desiredState = !(current?.state ?? false);
      if (desiredDimming === undefined && typeof current?.dimming === 'number') {
        desiredDimming = current.dimming;
      }
    } else {
      desiredState = action === 'on';
    }

    const params: Record<string, unknown> = { state: desiredState };
    if (typeof desiredDimming === 'number') params.dimming = desiredDimming;

    await sendWizCommand(host, { method: 'setPilot', params });
    return { state: desiredState, dimming: desiredDimming };
  }
}
