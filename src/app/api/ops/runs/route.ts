import { NextResponse } from "next/server";
import { getEodRuns, getEodMetrics } from "@/lib/eodDb";
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
        fees_usd: m.fees_usd_total ?? 0,
        net_realized_usd: m.net_realized_after_fees_usd ?? m.realized_pnl_usd ?? 0,
        maker_trades: m.maker_trades ?? 0,
        taker_trades: m.taker_trades ?? 0,
        maker_fees_usd: m.maker_fees_usd ?? 0,
        taker_fees_usd: m.taker_fees_usd ?? 0,
        swept_to_usd: m.swept_to_usd ?? 0,
        usd_balance_after: m.usd_balance_after ?? 0,
      };
    });
    const cumulative_fees_usd_24h = await getCumulativeFeesUsdLast24h();
    return NextResponse.json({ runs: out, cumulative_fees_usd_24h: cumulative_fees_usd_24h });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
