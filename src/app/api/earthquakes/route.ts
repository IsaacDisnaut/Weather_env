import { NextResponse } from "next/server";
import { fetchQuakes } from "@/lib/earthquake";

export const runtime = "nodejs";
export const revalidate = 120;

export async function GET() {
  try {
    return NextResponse.json(await fetchQuakes());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
