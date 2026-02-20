import { NextResponse } from "next/server";
import { fetchTicker } from "@/lib/krakenPublic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get("pair")?.trim() || "XBTUSD";
    const result = await fetchTicker(pair);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
