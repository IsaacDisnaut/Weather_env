import { NextResponse } from "next/server";
import { fetchWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  try {
    return NextResponse.json(await fetchWeather());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
