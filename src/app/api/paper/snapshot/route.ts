import { NextResponse } from "next/server";
import { getPaperSnapshot } from "@/lib/paper/paperEngine";
import { getBestBidAsk } from "@/lib/krakenPublic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId query required" }, { status: 400 });
  }

  try {
    const market = await getBestBidAsk("XBTUSD").catch(() => null);
    const snapshot = getPaperSnapshot(accountId, market ?? undefined);
    return NextResponse.json(snapshot);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
