import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { firstIssue, registerSchema } from "@/lib/validation";
import { DISCLOSURE_VERSION, toVibe } from "@/lib/vibes";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { email, password, name, phone, amountCents } = parsed.data;
  const vibe = toVibe(parsed.data.vibe) ?? "BALANCED";

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "There's already an account for that email. Try signing in instead." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    // One transaction so a user never exists without an account + risk profile.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        phone: phone || null,
        account: {
          create: {
            vibe,
            entries: {
              create: {
                type: "DEPOSIT",
                amountCents,
                label: "Opening deposit",
                note: "Sandbox funding — no real money moved.",
              },
            },
          },
        },
        riskProfile: {
          create: {
            vibe,
            disclosureVersion: DISCLOSURE_VERSION,
            acknowledgedAt: new Date(),
          },
        },
      },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    // P2002 = unique constraint; someone registered the same email in between.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "There's already an account for that email." },
        { status: 409 },
      );
    }
    console.error("register failed", error);
    return NextResponse.json({ error: "Something went wrong creating your account." }, { status: 500 });
  }
}
