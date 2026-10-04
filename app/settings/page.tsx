import { redirect } from "next/navigation";

import SecuritySettings from "@/components/SecuritySettings";
import { auth } from "@/lib/auth";

export const metadata = { title: "security · stacked." };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/settings");

  return <SecuritySettings />;
}
