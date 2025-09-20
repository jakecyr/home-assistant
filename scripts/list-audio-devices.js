#!/usr/bin/env node

const { PvRecorder } = require("@picovoice/pvrecorder-node");

const devices = PvRecorder.getAvailableDevices();

if (!devices.length) {
  console.log("No audio input devices detected.");
  process.exit(0);
}

console.log("Available audio input devices:");
for (const [index, name] of devices.entries()) {
  console.log(` [${index}] ${name}`);
}

console.log("\nSet AUDIO_DEVICE to an index from the list above or use a substring of the device name in your .env file.");
