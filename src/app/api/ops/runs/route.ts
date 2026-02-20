import { NextResponse } from "next/server";
import { getEodRuns, getEodMetrics } from "@/lib/eodDb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)),
      100
    );
    const runs = getEodRuns(limit);
    const out = runs.map((r) => {
      const m = getEodMetrics(r.id);
      return {
        run_id: r.id,
        started_at: r.started_at,
        status: r.status,
        pass: r.status === "PASS",
        pnl_usd: m.realized_pnl_usd ?? 0,
        trades: m.trade_count ?? 0,
        errors: m.error_count ?? 0,
        swept_to_usd: m.swept_to_usd ?? 0,
        usd_balance_after: m.usd_balance_after ?? 0,
      };
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
