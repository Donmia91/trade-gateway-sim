import { NextResponse } from "next/server";
import { stop } from "@/lib/sim/simEngine";
import { simState } from "@/lib/sim/state";

export async function POST(request: Request) {
  try {
    let body: { source?: string; scenario?: string; pair?: string } = {};
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      body = await request.json();
    }
    const source = (body.source as "SIM" | "KRAKEN_PUBLIC" | "COINBASE_PUBLIC") ?? simState.dataSource;
    if (source !== "SIM" && source !== "KRAKEN_PUBLIC" && source !== "COINBASE_PUBLIC") {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }
    await stop();
    simState.dataSource = source;
    if (body.scenario !== undefined) simState.scenarioName = body.scenario;
    if (body.pair !== undefined) simState.livePair = body.pair;
    const { getStatus } = await import("@/lib/sim/simEngine");
    return NextResponse.json(getStatus());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
