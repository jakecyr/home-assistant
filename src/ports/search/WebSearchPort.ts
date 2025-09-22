export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface WebSearchPort {
  search(query: string, limit?: number, location?: string): Promise<WebSearchResult[]>;
}
