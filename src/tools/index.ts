import type { Tool, ToolContext, ToolResult, OpenAIToolSpec } from "./_types";
import { toOpenAIToolSpec } from "./_types";

export type ToolRegistry = {
  specs: OpenAIToolSpec[]; // what we send to OpenAI
  exec: (name: string, args: any, ctx: ToolContext) => Promise<ToolResult>;
  names: string[];
};

const TOOL_LOADERS: Record<string, () => Tool> = {
  tplink_toggle: () => require("./tplink.toggle").default,
  wiz_toggle: () => require("./wiz.toggle").default,
  weather_current: () => require("./weather").default,
  time_now: () => require("./time.now").default,
  web_search: () => require("./web.search").default,
};

export type ToolName = keyof typeof TOOL_LOADERS;

export const AVAILABLE_TOOL_NAMES = Object.keys(TOOL_LOADERS);

export async function loadTools(enabledNames: string[] = []): Promise<ToolRegistry> {
  const selected = Array.from(
    new Set(enabledNames.map((name) => String(name).trim()).filter(Boolean))
  ) as string[];

  const enabledTools: Tool[] = [];
  for (const name of selected) {
    const loader = TOOL_LOADERS[name as ToolName];
    if (!loader) {
      console.warn(`[tools] Unknown tool requested: ${name}`);
      continue;
    }
    try {
      enabledTools.push(loader());
    } catch (err) {
      console.error(`[tools] Failed to load tool ${name}:`, err);
    }
  }

  if (process.env.DEBUG_TOOLS === "true") {
    console.log("[tools] Registered tools:");
    if (!enabledTools.length) {
      console.log("  (none)");
    }
    for (const tool of enabledTools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
      try {
        console.log(`    parameters: ${JSON.stringify(tool.parameters)}`);
      } catch {}
    }
  }

  const map = new Map<string, Tool>();
  for (const tool of enabledTools) map.set(tool.name, tool);

  return {
    specs: enabledTools.map(toOpenAIToolSpec),
    names: enabledTools.map((t) => t.name),
    async exec(name, args, ctx) {
      const t = map.get(name);
      if (!t) {
        return {
          ok: false,
          message: `Tool "${name}" is not enabled. Update the config tools list to use it.`,
        };
      }
      return t.execute(args, ctx);
    },
  };
}
