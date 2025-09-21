import type { StoragePort } from '../../../src/ports/sys/StoragePort';

describe('StoragePort contract (dummy implementation)', () => {
  class MemoryStorage implements StoragePort {
    private store = new Map<string, Buffer>();
    async write(key: string, value: Buffer | string): Promise<void> {
      const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
      this.store.set(key, buf);
    }
    async read(key: string): Promise<Buffer | null> {
      return this.store.get(key) ?? null;
    }
    async remove(key: string): Promise<void> {
      this.store.delete(key);
    }
  }

  test('write, read and remove work as expected', async () => {
    const s = new MemoryStorage();
    await s.write('a', 'hello');
    const buf = await s.read('a');
    expect(buf?.toString()).toBe('hello');

    await s.remove('a');
    const missing = await s.read('a');
    expect(missing).toBeNull();
  });
});
