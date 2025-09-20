import type { Tool, ToolContext, ToolResult, OpenAIToolSpec } from "./_types";
import { toOpenAIToolSpec } from "./_types";

export type ToolRegistry = {
  specs: OpenAIToolSpec[]; // what we send to OpenAI
  exec: (name: string, args: any, ctx: ToolContext) => Promise<ToolResult>;
  names: string[];
};

const tools: Tool[] = [
  require("./tplink.toggle").default,
  require("./wiz.toggle").default,
  require("./weather").default,
  require("./time.now").default,
  require("./web.search").default,
];

export async function loadTools(): Promise<ToolRegistry> {
  const map = new Map<string, Tool>();
  for (const t of tools) map.set(t.name, t);

  if (process.env.DEBUG_TOOLS === "true") {
    console.log("[tools] Registered tools:");
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
      try {
        console.log(`    parameters: ${JSON.stringify(tool.parameters)}`);
      } catch {}
    }
  }

  return {
    specs: tools.map(toOpenAIToolSpec),
    names: tools.map((t) => t.name),
    async exec(name, args, ctx) {
      const t = map.get(name);
      if (!t) return { ok: false, message: `Unknown tool: ${name}` };
      return t.execute(args, ctx);
    },
  };
}
