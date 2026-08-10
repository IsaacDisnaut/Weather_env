import { siteConfig } from "@/lib/config";
import type { WeatherPayload } from "@/lib/types";

type OpenMeteoResponse = {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    wind_speed_10m: number;
    weather_code: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

/** Open-Meteo เป็น API ฟรีที่ไม่ต้องใช้ API key */
export async function fetchWeather(): Promise<WeatherPayload> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(siteConfig.lat));
  url.searchParams.set("longitude", String(siteConfig.lon));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code,is_day",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,relative_humidity_2m,precipitation_probability",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");

  const response = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo responded ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;

  // ตัดชั่วโมงที่ผ่านไปแล้วออก เหลือ 24 ชั่วโมงข้างหน้า
  const nowIso = data.current.time;
  const startIndex = Math.max(
    0,
    data.hourly.time.findIndex((time) => time >= nowIso),
  );

  return {
    location: {
      name: siteConfig.name,
      lat: siteConfig.lat,
      lon: siteConfig.lon,
      timezone: data.timezone,
    },
    now: {
      time: data.current.time,
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      apparentTemperature: data.current.apparent_temperature,
      precipitation: data.current.precipitation,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
      isDay: data.current.is_day === 1,
    },
    hourly: data.hourly.time
      .slice(startIndex, startIndex + 24)
      .map((time, offset) => {
        const index = startIndex + offset;
        return {
          time,
          temperature: data.hourly.temperature_2m[index],
          humidity: data.hourly.relative_humidity_2m[index],
          precipitationProbability:
            data.hourly.precipitation_probability[index] ?? 0,
        };
      }),
    daily: data.daily.time.map((date, index) => ({
      date,
      weatherCode: data.daily.weather_code[index],
      tempMax: data.daily.temperature_2m_max[index],
      tempMin: data.daily.temperature_2m_min[index],
      precipitationProbability: data.daily.precipitation_probability_max[index] ?? 0,
    })),
    fetchedAt: Date.now(),
  };
}
