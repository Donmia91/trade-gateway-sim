import { NextResponse } from "next/server";
import { closeoutPaperToUsd } from "@/lib/paper/paperEngine";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = body.accountId ?? "";
    if (!accountId.trim()) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }

    const result = await closeoutPaperToUsd(accountId.trim());
    return NextResponse.json({
      closedQty: result.closedQty,
      netRealizedPnlUsd: result.netRealizedPnlUsd,
      swept: result.swept,
      sweepRunId: result.sweepRunId,
      snapshot: result.snapshot,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
