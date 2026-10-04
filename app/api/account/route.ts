import { NextResponse } from "next/server";

import { buildAccountPayload } from "@/lib/account-payload";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Everything the dashboard needs, in one round trip. */
export async function GET() {
  const user = await getSessionUser();
  const payload = user ? await buildAccountPayload(user) : null;

  if (!payload) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  return NextResponse.json(payload);
}
