import type { Tool } from "./_types";

const tool: Tool = {
  name: "lights_on",
  description: "Turn on the lights in a given room or area.",
  parameters: {
    type: "object",
    properties: {
      room: {
        type: "string",
        description: "Name of the room (e.g., living_room, bedroom)",
      },
      brightness: {
        type: "number",
        minimum: 1,
        maximum: 100,
        description: "Optional brightness 1-100",
      },
    },
    required: ["room"],
    additionalProperties: false,
  },
  async execute(args, ctx) {
    ctx.log("🔧 lights_on called with:", args);
    // TODO: integrate with your lighting system here
    return {
      ok: true,
      message: `Lights on in ${args.room}`,
      data: { room: args.room, brightness: args.brightness ?? 100 },
    };
  },
};

export default tool;
