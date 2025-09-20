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
      JSON.stringify({
        tplink: {
          devices: {
            lamp: {
              ip: "192.168.1.10",
              room: "office",
              aliases: ["desk lamp"],
            },
          },
        },
      })
    );

    const { config, path: resolved } = loadConfig(configPath);
    expect(resolved).toBe(configPath);
    expect(config.tplink?.devices?.lamp?.ip).toBe("192.168.1.10");
    expect(config.tplink?.devices?.lamp?.room).toBe("office");
    expect(config.tplink?.devices?.lamp?.aliases).toEqual(["desk lamp"]);
  });

  test("resolveDevice matches by friendly name or IP", () => {
    const map = {
      lamp: { ip: "192.168.1.20" },
      desk: { ip: "192.168.1.30", room: "office" },
    };
    expect(resolveDevice(map, "lamp")?.ip).toBe("192.168.1.20");
    expect(resolveDevice(map, "192.168.1.99")?.ip).toBe("192.168.1.99");
    expect(resolveDevice(map, "unknown")).toBeNull();
    expect(resolveDevice(undefined, "unknown")).toBeNull();
  });
});
