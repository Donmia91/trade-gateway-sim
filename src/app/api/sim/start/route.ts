import { NextResponse } from "next/server";
import { start, getScenario } from "@/lib/sim/simEngine";

export async function POST(request: Request) {
  try {
    let body: { scenario?: string; tickMs?: number; source?: string; pair?: string } = {};
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      body = await request.json();
    }
    const scenario = body.scenario ?? "CHOP";
    const source = (body.source as "SIM" | "KRAKEN_PUBLIC" | "COINBASE_PUBLIC") ?? undefined;
    if (source === "SIM" && !getScenario(scenario)) {
      return NextResponse.json(
        { error: `Unknown scenario: ${scenario}` },
        { status: 400 }
      );
    }
    const status = await start({
      scenario,
      tickMs: body.tickMs,
      source,
      pair: body.pair,
    });
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
