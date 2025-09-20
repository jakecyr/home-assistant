import type { Tool } from "./_types";

const tool: Tool = {
  name: "lights_off",
  description: "Turn off the lights in a given room or area.",
  parameters: {
    type: "object",
    properties: {
      room: { type: "string", description: "Name of the room" },
    },
    required: ["room"],
    additionalProperties: false,
  },
  async execute(args, ctx) {
    ctx.log("🔧 lights_off called with:", args);
    // TODO: integrate with your lighting system here
    return {
      ok: true,
      message: `Lights off in ${args.room}`,
      data: { room: args.room },
    };
  },
};

export default tool;
