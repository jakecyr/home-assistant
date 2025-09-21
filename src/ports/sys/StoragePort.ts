export interface StoragePort {
  write(key: string, value: Buffer | string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}
