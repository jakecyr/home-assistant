import type { ToolExecutionResult } from "../ports/tools/ToolRegistryPort";
import type { WebSearchPort } from "../ports/search/WebSearchPort";

export interface WebSearchArgs {
  query: string;
  num_results?: number;
  location?: string;
}

export class WebSearchTool {
  readonly name = "web_search";
  readonly description =
    "Search the web for current information using the configured web search adapter.";

  readonly schema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query string.",
      },
      num_results: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "How many organic results to return (default 3).",
      },
      location: {
        type: "string",
        description: "Optional location string for localized results.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  };

  constructor(private readonly search: WebSearchPort) {}

  async exec(args: WebSearchArgs): Promise<ToolExecutionResult> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return { ok: false, message: "Search query is required" };
    }

    const numResults = Math.min(10, Math.max(1, Math.floor(args.num_results || 3)));
    let results;
    try {
      results = await this.search.search(
        query,
        numResults,
        typeof args.location === "string" ? args.location : undefined
      );
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || String(err),
      };
    }

    if (!results.length) {
      return { ok: true, message: `No search results found for "${query}".` };
    }

    const summary = results
      .slice(0, numResults)
      .map((item, idx) => `${idx + 1}. ${item.title} — ${item.snippet || item.url}`)
      .join("\n");

    return {
      ok: true,
      message: `Top results for "${query}":\n${summary}`,
      data: { results },
    };
  }
}
