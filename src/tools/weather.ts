import type { Tool } from "./_types";

type Units = "metric" | "imperial";

function resolveCoordinates(
  args: { latitude?: number; longitude?: number },
  configLat?: number,
  configLon?: number
) {
  const latitude =
    typeof args.latitude === "number" ? args.latitude : configLat ?? null;
  const longitude =
    typeof args.longitude === "number" ? args.longitude : configLon ?? null;
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

const weatherTool: Tool = {
  name: "weather_current",
  description:
    "Get current weather conditions using Open-Meteo. Provide coordinates or configure defaults in config.weather.",
  parameters: {
    type: "object",
    properties: {
      latitude: {
        type: "number",
        description: "Latitude in decimal degrees.",
      },
      longitude: {
        type: "number",
        description: "Longitude in decimal degrees.",
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        description: "Measurement system (defaults to config.weather.units or metric).",
      },
    },
    required: [],
    additionalProperties: false,
  },
  async execute(args, ctx) {
    const coords = resolveCoordinates(
      args,
      ctx.config.weather?.latitude,
      ctx.config.weather?.longitude
    );

    if (!coords) {
      return {
        ok: false,
        message:
          "Set latitude and longitude in config.weather or pass them to the tool call.",
      };
    }

    const units: Units = args.units || ctx.config.weather?.units || "metric";
    const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
    const windSpeedUnit = units === "imperial" ? "mph" : "kmh";

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", coords.latitude.toString());
    url.searchParams.set("longitude", coords.longitude.toString());
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,wind_speed_10m");
    url.searchParams.set("temperature_unit", temperatureUnit);
    url.searchParams.set("wind_speed_unit", windSpeedUnit);
    url.searchParams.set("timezone", ctx.config.weather?.timezone || "auto");

    const res = await fetch(url.toString());
    if (!res.ok) {
      return {
        ok: false,
        message: `Weather service error: ${res.status} ${res.statusText}`,
      };
    }

    const data = await res.json();
    const current = data.current || data.current_weather;
    if (!current) {
      return {
        ok: false,
        message: "Weather data unavailable for the requested location.",
      };
    }

    const temperature = current.temperature_2m ?? current.temperature;
    const humidity = current.relative_humidity_2m ?? current.relative_humidity;
    const windSpeed = current.wind_speed_10m ?? current.windspeed;

    const unitSymbol = units === "imperial" ? "°F" : "°C";
    const windUnit = units === "imperial" ? "mph" : "km/h";

    const message = `Current temperature is ${temperature}${unitSymbol}, humidity ${humidity}% and wind ${windSpeed} ${windUnit}.`;
    return {
      ok: true,
      message,
      data: {
        temperature,
        humidity,
        windSpeed,
        units,
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
    };
  },
};

export default weatherTool;
