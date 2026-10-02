import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * "Keep me signed in" = off.
 *
 * Auth.js always sets a persistent cookie (Max-Age). Re-setting the same value
 * without an expiry downgrades it to a browser-session cookie, so closing the
 * browser signs the user out.
 */
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const jar = await cookies();
  const cookie = jar.getAll().find((c) => c.name.endsWith("session-token"));
  if (!cookie) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  jar.set(cookie.name, cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}
