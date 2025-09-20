import fs from "fs";
import path from "path";
import os from "os";
import { loadConfig, resolveDevice } from "../src/config";

describe("config helpers", () => {
  test("loadConfig returns empty config when file missing", () => {
    const { config, path: resolved } = loadConfig(
      "/tmp/non-existent-config.json"
    );
    expect(config).toEqual({});
    expect(resolved).toBeUndefined();
  });

  test("loadConfig reads and parses JSON", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-config-"));
    const configPath = path.join(tempDir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ tplink: { devices: { lamp: "192.168.1.10" } } })
    );

    const { config, path: resolved } = loadConfig(configPath);
    expect(resolved).toBe(configPath);
    expect(config.tplink?.devices?.lamp).toBe("192.168.1.10");
  });

  test("resolveDevice matches by friendly name or IP", () => {
    const map = { lamp: "192.168.1.20", desk: "192.168.1.30" };
    expect(resolveDevice(map, "lamp")).toBe("192.168.1.20");
    expect(resolveDevice(map, "192.168.1.99")).toBe("192.168.1.99");
    expect(resolveDevice(map, "unknown")).toBeNull();
    expect(resolveDevice(undefined, "unknown")).toBeNull();
  });
});
