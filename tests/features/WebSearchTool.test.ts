import { WebSearchTool } from '../../src/features/WebSearchTool';
import type { WebSearchPort } from '../../src/ports/search/WebSearchPort';

describe('WebSearchTool', () => {
  function makeSearch(results: any[] = [], throwErr: any = null): WebSearchPort {
    return {
      search: jest.fn(async (q: string, n: number, loc?: string) => {
        if (throwErr) throw throwErr;
        return results.slice(0, n);
      }),
    } as any;
  }

  test('requires non-empty query', async () => {
    const tool = new WebSearchTool(makeSearch());
    const res = await tool.exec({} as any);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/query is required/i);
  });

  test('calls search with clamped result count and optional location', async () => {
    const results = [
      { title: 'A', url: 'http://a', snippet: 'aa' },
      { title: 'B', url: 'http://b', snippet: 'bb' },
      { title: 'C', url: 'http://c', snippet: 'cc' },
      { title: 'D', url: 'http://d', snippet: 'dd' },
    ];
    const search = makeSearch(results);
    const tool = new WebSearchTool(search);

    const res = await tool.exec({ query: 'news', num_results: 50, location: 'US' });
    expect((search.search as jest.Mock).mock.calls[0]).toEqual(['news', 10, 'US']);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Top results for "news":/);
    expect(res.message).toMatch(/1\. A — aa/);
  });

  test('returns friendly message when no results', async () => {
    const tool = new WebSearchTool(makeSearch([]));
    const res = await tool.exec({ query: 'nothing' });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/No search results found/);
  });

  test('propagates search errors as failure ToolExecutionResult', async () => {
    const error = new Error('api down');
    const tool = new WebSearchTool(makeSearch([], error));
    const res = await tool.exec({ query: 'x' });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('api down');
  });
});
