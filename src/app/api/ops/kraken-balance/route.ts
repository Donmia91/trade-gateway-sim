import { NextResponse } from "next/server";
import { getBalance } from "@/lib/krakenPrivate";

export async function GET() {
  const apiKey = process.env.KRAKEN_API_KEY?.trim();
  const apiSecret = process.env.KRAKEN_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error: "Kraken API credentials not configured",
        message:
          "Set KRAKEN_API_KEY and KRAKEN_API_SECRET in .env.local (read-only Funds permissions).",
      },
      { status: 400 }
    );
  }

  try {
    const balances = await getBalance();
    return NextResponse.json({ balances });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kraken balance request failed", message },
      { status: 502 }
    );
  }
}
