import { NextResponse } from "next/server";
import { fetchKrakenTickerXbtUsd } from "@/lib/krakenPublic";

export async function GET() {
  try {
    const result = await fetchKrakenTickerXbtUsd();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
