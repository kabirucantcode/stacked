import { redirect } from "next/navigation";

import Dashboard from "@/components/Dashboard";
import { auth } from "@/lib/auth";

export const metadata = { title: "dashboard · stacked." };
export const dynamic = "force-dynamic";

/**
 * Server-side gate. The API also checks the session on every request, so this
 * redirect is only about UX — never the security boundary.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/dashboard");

  return <Dashboard />;
}
