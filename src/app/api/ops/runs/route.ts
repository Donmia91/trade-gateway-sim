import { NextResponse } from "next/server";
import { getEodRuns, getEodMetrics, getTotalFeesUsdFromMetrics } from "@/lib/eodDb";
import { getCumulativeFeesUsdLast24h } from "@/lib/ledger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("limit");
    const parsed = raw == null ? NaN : Number(raw);
    const limit = Number.isFinite(parsed) ? parsed : 10;
    const clamped = Math.min(Math.max(1, Math.floor(limit)), 100);
    const runs = getEodRuns(clamped);
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
        fees_usd: m.fees_usd ?? 0,
        maker_count: m.maker_count ?? 0,
        taker_count: m.taker_count ?? 0,
        swept_to_usd: m.swept_to_usd ?? 0,
        usd_balance_after: m.usd_balance_after ?? 0,
      };
    });
    const fromMetrics = getTotalFeesUsdFromMetrics();
    const cumulative_fees_usd =
      Number.isFinite(fromMetrics) && fromMetrics > 0
        ? fromMetrics
        : await getCumulativeFeesUsdLast24h();
    return NextResponse.json({ runs: out, cumulative_fees_usd_24h: cumulative_fees_usd });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
