type Units = "metric" | "imperial";

interface WeatherArgs {
  latitude?: number;
  longitude?: number;
  location?: string;
  units?: Units;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface GeocodeResult extends Coordinates {
  resolvedName?: string;
  timezone?: string;
}

interface WeatherConfig {
  latitude?: number;
  longitude?: number;
  units?: Units;
  timezone?: string;
}

interface ToolContext {
  config: {
    weather?: WeatherConfig;
  };
}

interface ToolOutcome {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

function resolveNumericCoordinates(
  args: WeatherArgs,
  configLat?: number,
  configLon?: number
): Coordinates | null {
  const hasArgLat = typeof args.latitude === "number";
  const hasArgLon = typeof args.longitude === "number";

  if (!hasArgLat && !hasArgLon) return null;
  if (hasArgLat && hasArgLon) {
    return { latitude: args.latitude!, longitude: args.longitude! };
  }

  const latitude =
    hasArgLat && typeof args.latitude === "number"
      ? args.latitude
      : typeof configLat === "number"
        ? configLat
        : null;
  const longitude =
    hasArgLon && typeof args.longitude === "number"
      ? args.longitude
      : typeof configLon === "number"
        ? configLon
        : null;

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function buildResolvedName(entry: any): string | undefined {
  if (!entry) return undefined;
  const parts = [entry.name, entry.admin1, entry.admin2, entry.country]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (!parts.length) return undefined;
  const unique = parts.filter((value, index) => parts.indexOf(value) === index);
  return unique.join(", ");
}

async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", "1");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding service error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const [first] = data.results;
  if (
    typeof first?.latitude !== "number" ||
    typeof first?.longitude !== "number"
  ) {
    return null;
  }

  return {
    latitude: first.latitude,
    longitude: first.longitude,
    resolvedName: buildResolvedName(first),
    timezone: typeof first.timezone === "string" ? first.timezone : undefined,
  };
}

const weatherTool = {
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
      location: {
        type: "string",
        description:
          "Free-form location name (city, address, etc.). Overrides config defaults when provided.",
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        description:
          "Measurement system (defaults to config.weather.units or metric).",
      },
    },
    required: [],
    additionalProperties: false,
  },

  async execute(args: WeatherArgs = {}, ctx: ToolContext): Promise<ToolOutcome> {
    const weather = ctx.config.weather;
    const configLat = weather?.latitude;
    const configLon = weather?.longitude;

    const hasNumericInput =
      typeof args.latitude === "number" || typeof args.longitude === "number";
    const locationQuery =
      typeof args.location === "string" ? args.location.trim() : "";

    let coords: Coordinates | null = null;
    let locationLabel: string | undefined;
    let timezone = weather?.timezone;

    if (hasNumericInput) {
      coords = resolveNumericCoordinates(args, configLat, configLon);
      if (!coords) {
        return {
          ok: false,
          message:
            "Please provide both latitude and longitude, or configure defaults in config.weather.",
        };
      }
    } else if (locationQuery.length > 0) {
      try {
        const match = await geocodeLocation(locationQuery);
        if (!match) {
          return {
            ok: false,
            message: `I couldn't find a location called "${locationQuery}". Try a different place or provide coordinates.`,
          };
        }
        coords = { latitude: match.latitude, longitude: match.longitude };
        locationLabel = match.resolvedName ?? locationQuery;
        if (!timezone && match.timezone) {
          timezone = match.timezone;
        }
      } catch (err) {
        return {
          ok: false,
          message: (err as Error).message,
        };
      }
    } else if (
      typeof configLat === "number" &&
      typeof configLon === "number"
    ) {
      coords = { latitude: configLat, longitude: configLon };
    }

    if (!coords) {
      return {
        ok: false,
        message:
          "Set latitude and longitude in config.weather, pass coordinates, or provide a location name to look up.",
      };
    }

    const units: Units = args.units || weather?.units || "metric";
    const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
    const windSpeedUnit = units === "imperial" ? "mph" : "kmh";

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", coords.latitude.toString());
    url.searchParams.set("longitude", coords.longitude.toString());
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,wind_speed_10m"
    );
    url.searchParams.set("temperature_unit", temperatureUnit);
    url.searchParams.set("wind_speed_unit", windSpeedUnit);
    url.searchParams.set("timezone", timezone ?? "auto");

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

    const prefix = locationLabel
      ? `Current weather for ${locationLabel}: `
      : "Current weather: ";
    const message = `${prefix}temperature is ${temperature}${unitSymbol}, humidity ${humidity}% and wind ${windSpeed} ${windUnit}.`;

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
        location: locationLabel,
      },
    };
  },
};

export default weatherTool;
