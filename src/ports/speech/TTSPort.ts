export interface TTSPort {
  synthesize(text: string): Promise<string>;
}
