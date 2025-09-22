import type { TimePort } from "../../ports/sys/TimePort";

export class NodeTime implements TimePort {
  now(): number {
    return Date.now();
  }

  toLocaleTimeString(epochMs: number): string {
    return new Date(epochMs).toLocaleTimeString();
  }
}
