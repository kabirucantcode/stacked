import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron-auth";
import { runDemoTradesForAll } from "@/lib/demo-trading";

export const dynamic = "force-dynamic";

/**
 * Scheduler endpoint: run one demo trade per funded account.
 * Call with `Authorization: Bearer $CRON_SECRET` from a Render cron job.
 */
async function handle(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runDemoTradesForAll();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}

// Also accept GET so simple schedulers that can only issue a URL still work.
export async function GET(request: Request) {
  return handle(request);
}
