import { NextResponse } from "next/server";
import { placeMarketOrder } from "@/lib/paper/paperEngine";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = body.accountId ?? "";
    const side = body.side === "buy" || body.side === "sell" ? body.side : null;
    const qtyBtc = typeof body.qtyBtc === "number" ? body.qtyBtc : Number(body.qtyBtc);

    if (!accountId.trim()) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }
    if (!side) {
      return NextResponse.json({ error: "side must be 'buy' or 'sell'" }, { status: 400 });
    }
    if (!Number.isFinite(qtyBtc) || qtyBtc <= 0) {
      return NextResponse.json({ error: "qtyBtc must be a positive number" }, { status: 400 });
    }

    const result = await placeMarketOrder({ accountId: accountId.trim(), side, qtyBtc });
    return NextResponse.json({
      fillId: result.fillId,
      side: result.side,
      qty: result.qty,
      price: result.price,
      notionalUsd: result.notionalUsd,
      feeUsd: result.feeUsd,
      liquidity: result.liquidity,
      realizedPnlUsd: result.realizedPnlUsd,
      snapshot: result.snapshot,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
