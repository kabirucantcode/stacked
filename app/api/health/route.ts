import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liveness + database reachability, used as Render's health check. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
