import type { Tool } from "./_types";

const searchTool: Tool = {
  name: "web_search",
  description:
    "Search the web for current information using the SerpAPI service. Requires SERPAPI_KEY to be configured.",
  parameters: {
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
  },
  async execute(args, ctx) {
    const apiKey = ctx.env.serpApiKey;
    if (!apiKey) {
      return {
        ok: false,
        message: "SERPAPI_KEY is not set. Add it to your environment to enable web search.",
      };
    }

    const query = String(args.query || "").trim();
    if (!query) {
      return { ok: false, message: "Search query is required" };
    }

    const numResults = Math.min(
      10,
      Math.max(1, Math.floor(args.num_results || 3))
    );

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("num", numResults.toString());
    url.searchParams.set("api_key", apiKey);
    if (args.location) url.searchParams.set("location", String(args.location));

    const res = await fetch(url.toString());
    if (!res.ok) {
      const message = `SerpAPI error: ${res.status} ${res.statusText}`;
      ctx.log(message);
      return { ok: false, message };
    }

    const data = await res.json();
    const organic: Array<any> = data.organic_results || [];
    if (!organic.length) {
      return { ok: true, message: "No search results found." };
    }

    const top = organic.slice(0, numResults).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayed_link: item.displayed_link,
    }));

    const summary = top
      .map((item, idx) => `${idx + 1}. ${item.title} — ${item.snippet || item.displayed_link}`)
      .join(" \n");

    return {
      ok: true,
      message: `Top results for "${query}":\n${summary}`,
      data: { results: top },
    };
  },
};

export default searchTool;
