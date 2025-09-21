export type AudioChunkHandler = (chunk: Buffer) => void;

export interface AudioInputPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  onChunk(handler: AudioChunkHandler): () => void;
}
