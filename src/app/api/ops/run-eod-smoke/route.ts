import { NextResponse } from "next/server";
import { runEod } from "@/lib/eod/runEod";

let eodSmokeLock = false;

export async function POST() {
  if (eodSmokeLock) {
    return NextResponse.json(
      { error: "EOD smoke run already in progress" },
      { status: 409 }
    );
  }

  eodSmokeLock = true;
  try {
    const result = await runEod({
      configPath: "configs/smoke.json",
      gatesPath: "configs/ops-gates-smoke.json",
      writeLatest: true,
    });

    return NextResponse.json({
      runId: result.runId,
      status: result.status,
      summaryPath: result.summaryPath,
      latestPath: result.latestPath,
      metrics: {
        pnl: result.metrics.realized_pnl_usd,
        fees: result.metrics.fees_usd,
        swept: result.metrics.swept_to_usd,
        usd_after: result.metrics.usd_balance_after,
        trade_count: result.metrics.trade_count,
        error_count: result.metrics.error_count,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    eodSmokeLock = false;
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to run EOD smoke." },
    { status: 405 }
  );
}
