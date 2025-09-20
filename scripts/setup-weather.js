#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = "config.json";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { write: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--config":
        out.config = args[++i];
        break;
      case "--write":
        out.write = true;
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
  console.log(`Detect approximate latitude/longitude via IP and optionally store them in config.json.

Usage: node scripts/setup-weather.js [--config file] [--write]

Options:
  --config <file>  Path to config JSON (default: ./config.json)
  --write          Merge detected coordinates into the config file
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function lookupCoords() {
  const providers = [
    async () => {
      const data = await fetchJson("https://ipapi.co/json/");
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
        timezone: data.timezone,
      };
    },
    async () => {
      const data = await fetchJson("https://ipwho.is/");
      if (data.success === false) {
        throw new Error(data.message || "ipwho.is lookup failed");
      }
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country,
        timezone: data.timezone,
      };
    },
  ];

  let lastError;
  for (const provider of providers) {
    try {
      const result = await provider();
      if (
        typeof result.latitude === "number" &&
        typeof result.longitude === "number"
      ) {
        return result;
      }
      lastError = new Error("Provider returned invalid coordinates");
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to detect coordinates");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    showHelp();
    return;
  }

  console.log("Detecting location via ipapi.co…");
  const info = await lookupCoords();
  console.log(
    `Approximate location: ${info.city || "Unknown city"}, ${
      info.region || "unknown region"
    }, ${info.country || "unknown country"}`
  );
  console.log(
    `Coordinates: latitude ${info.latitude.toFixed(4)}, longitude ${info.longitude.toFixed(4)}${
      info.timezone ? `, timezone ${info.timezone}` : ""
    }`
  );

  if (!args.write) {
    console.log("Run again with --write to store these values in config.json.");
    return;
  }

  const { path: configPath, data } = loadConfig(args.config);
  const section = data.weather || (data.weather = {});
  section.latitude = info.latitude;
  section.longitude = info.longitude;
  if (info.timezone) section.timezone = info.timezone;

  saveConfig(configPath, data);
}

main().catch((err) => {
  console.error(
    "Failed to set up weather defaults:",
    err?.message || err
  );
  console.error("You can re-run later or edit config.json manually with latitude/longitude.");
  process.exitCode = 1;
});
