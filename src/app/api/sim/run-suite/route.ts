import { NextResponse } from "next/server";
import { runSuite, getDefaultPlan } from "@/lib/sim/suiteRunner";
import type { SuiteStep } from "@/lib/sim/state";

export async function POST(request: Request) {
  try {
    let body: { plan?: SuiteStep[]; tickMs?: number } = {};
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      body = await request.json();
    }
    const plan = body.plan ?? getDefaultPlan();
    const result = await runSuite(plan, body.tickMs);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
