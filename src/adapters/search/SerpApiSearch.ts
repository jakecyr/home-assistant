import type { WebSearchPort, WebSearchResult } from "../../ports/search/WebSearchPort";

export interface SerpApiOptions {
  apiKey?: string;
}

export class SerpApiSearch implements WebSearchPort {
  constructor(private readonly options: SerpApiOptions) {}

  async search(query: string, limit = 3, location?: string): Promise<WebSearchResult[]> {
    const apiKey = this.options.apiKey;
    if (!apiKey) {
      throw new Error("SERPAPI_KEY is not configured.");
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("num", Math.min(10, Math.max(1, limit)).toString());
    url.searchParams.set("api_key", apiKey);
    if (location) url.searchParams.set("location", location);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const organic: Array<any> = data.organic_results || [];
    return organic.slice(0, limit).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));
  }
}
