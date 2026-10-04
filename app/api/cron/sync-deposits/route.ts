import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { syncAllDeposits } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Scheduler endpoint: re-scan every assigned deposit address for new transfers.
 * Call with `Authorization: Bearer $CRON_SECRET` from a Render cron job.
 *
 * This is the reliable path for crediting deposits; the per-user `/api/crypto/sync`
 * call exists so a user can nudge it from the dashboard.
 */
async function handle(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncAllDeposits();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("scheduled deposit sync failed", error);
    return NextResponse.json({ error: "Sync failed." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
