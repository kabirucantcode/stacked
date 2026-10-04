import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "./password";
import { prisma } from "./prisma";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Render terminates TLS and proxies to us, so the forwarded host is trusted.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        // Assigned to a variable (rather than returned as a fresh literal) so the
        // extra `tokenVersion` field is allowed by the structural return type.
        const authenticated = {
          id: user.id,
          email: user.email,
          name: user.name,
          tokenVersion: user.tokenVersion,
        };
        return authenticated;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        // Stamp the JWT with the user's current version. A password change bumps
        // the database value, which invalidates every previously issued token.
        token.tv = (user as { tokenVersion?: number }).tokenVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      const view = session.user as { id?: string; tokenVersion?: number };
      if (typeof token.uid === "string") view.id = token.uid;
      if (typeof token.tv === "number") view.tokenVersion = token.tv;
      return session;
    },
  },
});

/**
 * Resolve the signed-in user (with their account and risk profile) from the
 * session. Returns null when there is no valid session.
 */
export async function getSessionUser() {
  const session = await auth();
  const view = session?.user as { id?: string; tokenVersion?: number } | undefined;
  if (!view?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: view.id },
    include: { account: true, riskProfile: true },
  });
  if (!user) return null;

  // Reject tokens issued before the last password change.
  if (user.tokenVersion !== (view.tokenVersion ?? 0)) return null;

  return user;
}
