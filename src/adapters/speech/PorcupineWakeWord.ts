import { Porcupine } from '@picovoice/porcupine-node';
import type { WakeWordPort } from '../../ports/speech/WakeWordPort';

export interface PorcupineWakeWordOptions {
  accessKey: string;
  keyword: string;
  sensitivity?: number;
}

export class PorcupineWakeWord implements WakeWordPort {
  private readonly porcupine: Porcupine;

  constructor(options: PorcupineWakeWordOptions) {
    if (!options.accessKey) {
      throw new Error('Porcupine access key is required');
    }
    this.porcupine = new Porcupine(
      options.accessKey,
      [options.keyword],
      [options.sensitivity ?? 0.4],
    );
  }

  get frameLength(): number {
    return this.porcupine.frameLength;
  }

  processPcm(frame: Int16Array): boolean {
    const idx = this.porcupine.process(frame);
    return idx >= 0;
  }

  reset(): void {
    // no-op; exposed for interface completeness
  }

  dispose(): void {
    this.porcupine.release();
  }
}
