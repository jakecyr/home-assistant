import type { WebSearchPort } from '../../../src/ports/search/WebSearchPort';

describe('WebSearchPort contract (dummy implementation)', () => {
  class FakeSearch implements WebSearchPort {
    async search(query: string, limit: number = 3, location?: string) {
      return [
        { title: 'Result', url: 'http://example.com', snippet: location ? `at ${location}` : undefined },
      ];
    }
  }

  test('search returns results and accepts optional args', async () => {
    const s = new FakeSearch();
    const results = await s.search('q', undefined as any, 'US');
    expect(Array.isArray(results)).toBe(true);
    expect(results[0]).toHaveProperty('title');
  });
});
