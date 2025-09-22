export interface WakeWordPort {
  processPcm(frame: Int16Array): boolean;
  reset?(): void;
}
