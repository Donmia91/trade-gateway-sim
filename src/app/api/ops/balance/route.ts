import { NextResponse } from "next/server";
import { ensureBalance, getBalance } from "@/lib/ledger";

export async function GET() {
  try {
    await ensureBalance("USD");
    const amount = await getBalance("USD");
    return NextResponse.json({ currency: "USD", amount });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
