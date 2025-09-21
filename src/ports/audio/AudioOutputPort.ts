export interface PlayOptions {
  signal?: AbortSignal;
}

export interface ToneOptions {
  frequency: number;
  ms: number;
  volume?: number;
}

export interface PlayStreamOptions extends PlayOptions {
  sampleRate: number;
}

export interface AudioOutputPort {
  play(filePath: string, options?: PlayOptions): Promise<void>;
  prepareTone(name: string, options: ToneOptions): Promise<string>;
  playStream?(
    stream: AsyncIterable<Buffer>,
    options: PlayStreamOptions
  ): Promise<void>;
}
