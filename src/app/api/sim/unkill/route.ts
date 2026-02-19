import { NextResponse } from "next/server";
import { setKillSwitch } from "@/lib/sim/state";
import { logEvent } from "@/lib/ledger";
import { getStatus } from "@/lib/sim/simEngine";

export async function POST() {
  setKillSwitch(false);
  logEvent("KILL_SWITCH_OFF", { ts: Date.now() });
  const status = getStatus();
  return NextResponse.json(status);
}
