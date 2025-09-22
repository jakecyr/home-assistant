export type DeviceToggleAction = "on" | "off" | "toggle";

export interface SmartDevicePort {
  toggle(deviceName: string, action: DeviceToggleAction, options?: Record<string, unknown>): Promise<void>;
}
