import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 5000;

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

// WMO weather codes -> short description, per Open-Meteo's docs.
const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
};

// Real Open-Meteo lookup, no API key needed.
export async function weatherHandler(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_input",
      details: parsed.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set("latitude", String(parsed.data.lat));
    url.searchParams.set("longitude", String(parsed.data.lon));
    url.searchParams.set("current", "temperature_2m,weathercode,wind_speed_10m");

    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) {
      throw new Error(`Open-Meteo returned ${upstream.status}`);
    }

    const body = (await upstream.json()) as {
      current: { temperature_2m: number; weathercode: number; wind_speed_10m: number; time: string };
    };

    res.json({
      lat: parsed.data.lat,
      lon: parsed.data.lon,
      temperature_c: body.current.temperature_2m,
      wind_speed_kmh: body.current.wind_speed_10m,
      conditions: WEATHER_CODES[body.current.weathercode] ?? `WMO code ${body.current.weathercode}`,
      observed_at: body.current.time,
      source: "open-meteo",
    });
  } catch (err) {
    logger.error({ err }, "weather: upstream (Open-Meteo) unavailable");
    res.status(503).json({ error: "upstream_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
