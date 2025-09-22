export type TranscriptHandler = (transcript: string) => void;

export interface STTPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendPcm(chunk: Buffer): void;
  onTranscript(handler: TranscriptHandler): () => void;
}
