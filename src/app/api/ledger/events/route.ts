import { NextResponse } from "next/server";
import { getEvents } from "@/lib/ledger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10)),
      500
    );
    const events = getEvents(limit);
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
