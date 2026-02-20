import { NextResponse } from "next/server";
import { ensurePaperAccount } from "@/lib/paper/paperEngine";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const initialUsd = typeof body.initialUsd === "number" && body.initialUsd >= 0 ? body.initialUsd : 10_000;
    const accountId = ensurePaperAccount(undefined, initialUsd);
    return NextResponse.json({ accountId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
