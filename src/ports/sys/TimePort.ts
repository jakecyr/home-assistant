export interface TimePort {
  now(): number;
  toLocaleTimeString(epochMs: number): string;
}
