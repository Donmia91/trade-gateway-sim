import { NextResponse } from "next/server";
import { stop } from "@/lib/sim/simEngine";

export async function POST() {
  try {
    const status = await stop();
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
