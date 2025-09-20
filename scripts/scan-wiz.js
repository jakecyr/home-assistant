#!/usr/bin/env node

const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = "config.json";
const BROADCAST_ADDR = "255.255.255.255";
const WIZ_PORT = 38899;

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
  console.log(`Scan for Philips WiZ devices on the local network.

Usage: node scripts/scan-wiz.js [--config file] [--write] [--force]

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

function sanitizeName(name, host) {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || `wiz_${host.replace(/\./g, "_")}`;
}

async function scanWiz(timeoutMs = 4000) {
  const socket = dgram.createSocket("udp4");
  const devices = new Map();

  return new Promise((resolve) => {
    socket.on("message", (msg, rinfo) => {
      try {
        const payload = JSON.parse(msg.toString());
        const params = payload.result || payload.params || {};
        const alias =
          params.alias ||
          params.nickname ||
          params.name ||
          params.moduleName ||
          params.macAddress ||
          rinfo.address;
        devices.set(rinfo.address, {
          host: rinfo.address,
          alias,
          mac: params.macAddress,
          model: params.moduleName || params.deviceName,
        });
      } catch (err) {
        // ignore invalid packets
      }
    });

    socket.bind(0, () => {
      socket.setBroadcast(true);
      const message = Buffer.from(
        JSON.stringify({ method: "getSystemConfig", params: {} }),
        "utf8"
      );
      socket.send(message, 0, message.length, WIZ_PORT, BROADCAST_ADDR);
      const secondary = Buffer.from(JSON.stringify({ method: "getPilot" }), "utf8");
      socket.send(secondary, 0, secondary.length, WIZ_PORT, BROADCAST_ADDR);
    });

    setTimeout(() => {
      socket.close();
      resolve(Array.from(devices.values()));
    }, timeoutMs);
  });
}

function mergeDevices(config, entries, force) {
  if (!entries.length) return { updated: false, added: [] };
  const section = config.wiz || (config.wiz = {});
  const devices = section.devices || (section.devices = {});

  const added = [];
  for (const entry of entries) {
    const baseName = sanitizeName(entry.alias, entry.host);
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

  console.log("Scanning local network for WiZ lights…");
  const results = await scanWiz();

  if (!results.length) {
    console.log("No WiZ devices discovered.");
  } else {
    console.log(`Discovered ${results.length} device(s):`);
    for (const device of results) {
      console.log(
        ` - ${device.alias || "Unnamed"} (${device.host})${
          device.model ? ` [${device.model}]` : ""
        }`
      );
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
