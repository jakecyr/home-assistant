import {
  buildDeviceContextSummary,
  getAllDeviceNames,
  shouldContinueConversation,
} from "../src/deviceContext";
import type { AppConfig } from "../src/config";

describe("device context helpers", () => {
  const config: AppConfig = {
    tplink: { devices: { tall_lamp: "192.168.1.10" } },
    wiz: { devices: { sofa_light: "192.168.1.11" } },
  };

  test("buildDeviceContextSummary lists devices", () => {
    const summary = buildDeviceContextSummary(config, [
      "tplink_toggle",
      "wiz_toggle",
    ]);
    expect(summary).toContain("TP-Link devices available");
    expect(summary).toContain('"tall_lamp"');
    expect(summary).toContain("WiZ lights available");
    expect(summary).toContain('"sofa_light"');
  });

  test("buildDeviceContextSummary returns null when no devices", () => {
    expect(buildDeviceContextSummary({}, ["tplink_toggle"])).toBeNull();
  });

  test("buildDeviceContextSummary skips tools that are disabled", () => {
    const summary = buildDeviceContextSummary(config, ["tplink_toggle"]);
    expect(summary).toContain('"tall_lamp"');
    expect(summary).not.toContain('"sofa_light"');
  });

  test("getAllDeviceNames returns all device keys", () => {
    expect(getAllDeviceNames(config, ["tplink_toggle", "wiz_toggle"])).toEqual([
      "tall_lamp",
      "sofa_light",
    ]);
    expect(getAllDeviceNames(config, ["tplink_toggle"])).toEqual(["tall_lamp"]);
  });

  test("shouldContinueConversation detects questions and confirmations", () => {
    expect(shouldContinueConversation("What should I do?")).toBe(true);
    expect(shouldContinueConversation("Please say yes or no.")).toBe(true);
    expect(shouldContinueConversation("All done.")).toBe(false);
  });
});
