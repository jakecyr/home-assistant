import { SerpApiSearch } from '../../../src/adapters/search/SerpApiSearch';

describe('SerpApiSearch', () => {
  const origFetch = global.fetch as any;
  beforeEach(() => {
    // @ts-ignore
    global.fetch = jest.fn();
  });
  afterEach(() => {
    // @ts-ignore
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  test('throws when apiKey missing', async () => {
    const search = new SerpApiSearch({});
    await expect(search.search('x')).rejects.toThrow(/SERPAPI_KEY/i);
  });

  test('calls SerpAPI and maps results', async () => {
    const results = [
      { title: 'A', link: 'https://a', snippet: 'aa' },
      { title: 'B', link: 'https://b', snippet: 'bb' },
    ];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ organic_results: results }),
    });

    const search = new SerpApiSearch({ apiKey: 'key' });
    const out = await search.search('hello', 2, 'Boston, MA');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://serpapi.com/search.json');
    expect(url.searchParams.get('q')).toBe('hello');
    expect(url.searchParams.get('num')).toBe('2');
    expect(url.searchParams.get('api_key')).toBe('key');
    expect(url.searchParams.get('location')).toBe('Boston, MA');

    expect(out).toEqual([
      { title: 'A', url: 'https://a', snippet: 'aa' },
      { title: 'B', url: 'https://b', snippet: 'bb' },
    ]);
  });

  test('throws on http error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, statusText: 'Bad' });
    const search = new SerpApiSearch({ apiKey: 'key' });
    await expect(search.search('x')).rejects.toThrow(/SerpAPI error/);
  });
});
