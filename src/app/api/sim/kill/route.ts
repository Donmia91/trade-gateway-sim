import { NextResponse } from "next/server";
import { setKillSwitch } from "@/lib/sim/state";
import { logEvent } from "@/lib/ledger";
import { getStatus } from "@/lib/sim/simEngine";

export async function POST() {
  setKillSwitch(true);
  logEvent("KILL_SWITCH_ON", { ts: Date.now() });
  const status = getStatus();
  return NextResponse.json(status);
}
