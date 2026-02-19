import { NextResponse } from "next/server";
import { getSnapshots } from "@/lib/ledger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "500", 10)),
      2000
    );
    const sinceTs = searchParams.get("sinceTs");
    const snapshots = getSnapshots({
      limit,
      sinceTs: sinceTs ? parseInt(sinceTs, 10) : undefined,
    });
    return NextResponse.json(snapshots);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
