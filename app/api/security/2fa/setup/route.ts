import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";

/**
 * Begin 2FA enrolment.
 *
 * Stores a fresh secret but does NOT enable 2FA — that only happens once the
 * user proves they can generate a code from it, in `/enable`. Until then the
 * secret is inert, so a half-finished setup can't lock anyone out.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (user.totpEnabledAt) {
    return NextResponse.json(
      { error: "Two-factor is already on. Turn it off before starting again." },
      { status: 400 },
    );
  }

  const secret = generateTotpSecret();

  let sealed: string;
  try {
    sealed = sealSecret(secret);
  } catch (error) {
    console.error("cannot seal TOTP secret", error);
    return NextResponse.json(
      { error: "Two-factor isn't configured on the server yet." },
      { status: 500 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: sealed, totpEnabledAt: null, totpLastCounter: null },
  });

  return NextResponse.json({ secret, otpauthUrl: otpauthUrl(secret, user.email) });
}
