import { earthquakeConfig, siteConfig } from "@/lib/config";
import type { Quake, QuakePayload } from "@/lib/types";

type UsgsFeature = {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string;
    tsunami: number;
  };
  geometry: { coordinates: [number, number, number] };
};

type UsgsResponse = { features: UsgsFeature[] };

const EARTH_RADIUS_KM = 6371;

/** ระยะทางวงกลมใหญ่ (haversine) ระหว่างสองพิกัด หน่วยกิโลเมตร */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** USGS GeoJSON feed เป็นข้อมูลเปิด ไม่ต้องใช้ API key */
export async function fetchQuakes(): Promise<QuakePayload> {
  const response = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    { next: { revalidate: 120 }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) {
    throw new Error(`USGS responded ${response.status}`);
  }

  const data = (await response.json()) as UsgsResponse;

  const quakes: Quake[] = data.features
    .filter((feature) => feature.properties.mag !== null)
    .map((feature) => {
      const [lon, lat, depth] = feature.geometry.coordinates;
      const distance = distanceKm(siteConfig.lat, siteConfig.lon, lat, lon);
      const magnitude = feature.properties.mag as number;
      return {
        id: feature.id,
        magnitude,
        place: feature.properties.place ?? "Unknown",
        time: feature.properties.time,
        depthKm: depth,
        distanceKm: distance,
        lat,
        lon,
        url: feature.properties.url,
        tsunami: feature.properties.tsunami === 1,
        alert:
          distance <= earthquakeConfig.radiusKm &&
          magnitude >= earthquakeConfig.minMagnitude,
      };
    })
    .sort((a, b) => {
      // เหตุการณ์ที่เข้าเกณฑ์แจ้งเตือนขึ้นก่อน แล้วค่อยเรียงตามเวลาล่าสุด
      if (a.alert !== b.alert) return a.alert ? -1 : 1;
      return b.time - a.time;
    })
    .slice(0, 50);

  return {
    quakes,
    radiusKm: earthquakeConfig.radiusKm,
    minMagnitude: earthquakeConfig.minMagnitude,
    fetchedAt: Date.now(),
  };
}
