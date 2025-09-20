#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Client } = require("tplink-smarthome-api");
const dgram = require("dgram");

const DEFAULT_CONFIG = "config.json";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { write: false, force: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--config":
        out.config = args[++i];
        break;
      case "--write":
        out.write = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--help":
        out.help = true;
        break;
      default:
        console.warn(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function showHelp() {
  console.log(`Scan for TP-Link Kasa devices on the local network.

Usage: node scripts/scan-tplink.js [--config file] [--write] [--force]

Options:
  --config <file>  Path to config JSON (default: ./config.json)
  --write          Merge discovered devices into the config file
  --force          Overwrite existing entries with the same name when writing
`);
}

function loadConfig(configPath) {
  const resolved = path.resolve(configPath || DEFAULT_CONFIG);
  if (fs.existsSync(resolved)) {
    try {
      const content = fs.readFileSync(resolved, "utf8");
      return { path: resolved, data: JSON.parse(content) };
    } catch (err) {
      console.warn(`Failed to parse config at ${resolved}:`, err);
    }
  }
  return { path: resolved, data: {} };
}

function saveConfig(configPath, data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  console.log(`Updated config written to ${configPath}`);
}

function sanitizeName(name, fallback) {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

async function scanTpLink(timeoutMs = 7000) {
  const client = new Client();
  const devices = new Map();

  return new Promise((resolve) => {
    const discovery = client.startDiscovery({ discoveryInterval: 2000 });

    const handleDevice = (device) => {
      const alias = device.alias || device.deviceId || device.model || "unknown";
      devices.set(device.host, {
        host: device.host,
        alias,
        deviceId: device.deviceId,
        model: device.model,
      });
    };

    discovery.on("device-new", handleDevice);
    discovery.on("device-online", handleDevice);

    setTimeout(() => {
      try {
        discovery.stopDiscovery();
      } catch {}
      resolve(Array.from(devices.values()));
    }, timeoutMs);
  });
}

function encrypt(buffer, key = 0xab) {
  const out = Buffer.allocUnsafe(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    out[i] = c ^ key;
    key = out[i];
  }
  return out;
}

function decrypt(buffer, key = 0xab) {
  const out = Buffer.allocUnsafe(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    out[i] = c ^ key;
    key = c;
  }
  return out;
}

async function legacyScan(timeoutMs = 5000) {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const devices = new Map();

  return new Promise((resolve) => {
    socket.on("message", (msg, rinfo) => {
      try {
        const decrypted = decrypt(msg);
        const payload = JSON.parse(decrypted.toString("utf8"));
        const sysinfo = payload?.system?.get_sysinfo;
        if (!sysinfo) return;
        const alias =
          sysinfo.alias ||
          sysinfo.dev_name ||
          sysinfo.model ||
          sysinfo.deviceId ||
          rinfo.address;
        devices.set(rinfo.address, {
          host: rinfo.address,
          alias,
          deviceId: sysinfo.deviceId,
          model: sysinfo.model || sysinfo.type || sysinfo.mic_type,
        });
      } catch (err) {
        // ignore malformed packets
      }
    });

    socket.bind(9998, undefined, () => {
      socket.setBroadcast(true);
      const message = encrypt(Buffer.from('{"system":{"get_sysinfo":{}}}', "utf8"));
      socket.send(message, 0, message.length, 9999, "255.255.255.255");
    });

    setTimeout(() => {
      try {
        socket.close();
      } catch {}
      resolve(Array.from(devices.values()));
    }, timeoutMs);
  });
}

async function discoverDevices() {
  const combined = new Map();

  const primary = await scanTpLink();
  for (const device of primary) {
    combined.set(device.host, device);
  }

  if (primary.length === 0) {
    const fallback = await legacyScan();
    for (const device of fallback) {
      if (!combined.has(device.host)) combined.set(device.host, device);
    }
  }

  return Array.from(combined.values());
}

function mergeDevices(config, entries, force) {
  if (!entries.length) return { updated: false, added: [] };
  const section = config.tplink || (config.tplink = {});
  const devices = section.devices || (section.devices = {});

  const added = [];
  for (const entry of entries) {
    const baseName = sanitizeName(entry.alias, `tplink_${entry.host.replace(/\./g, "_")}`);
    let name = baseName;
    let counter = 1;
    while (!force && devices[name] && devices[name] !== entry.host) {
      name = `${baseName}_${counter++}`;
    }
    if (!force && devices[name] && devices[name] === entry.host) continue;
    devices[name] = entry.host;
    added.push({ name, host: entry.host });
  }

  return { updated: added.length > 0, added };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    showHelp();
    return;
  }

  console.log("Scanning local network for TP-Link Kasa devices…");
  const results = await discoverDevices();

  if (!results.length) {
    console.log("No TP-Link devices discovered.");
  } else {
    console.log(`Discovered ${results.length} device(s):`);
    for (const device of results) {
      console.log(` - ${device.alias || "Unnamed"} (${device.host}) [${device.model || "unknown"}]`);
    }
  }

  if (!args.write || !results.length) return;

  const { path: configPath, data } = loadConfig(args.config);
  const { updated, added } = mergeDevices(data, results, args.force);

  if (!updated) {
    console.log("Config already contains mappings for all discovered devices.");
    return;
  }

  saveConfig(configPath, data);
  console.log("Added entries:");
  for (const entry of added) {
    console.log(` - ${entry.name}: ${entry.host}`);
  }
}

main().catch((err) => {
  console.error("Scan failed:", err);
  process.exitCode = 1;
});
