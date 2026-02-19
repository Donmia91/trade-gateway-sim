import { NextResponse } from "next/server";
import { status } from "@/lib/sim/simEngine";

export async function GET() {
  try {
    const s = status();
    return NextResponse.json(s);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
