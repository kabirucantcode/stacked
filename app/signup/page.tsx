import { redirect } from "next/navigation";

import AuthNav from "@/components/AuthNav";
import SignupForm from "@/components/SignupForm";
import { auth } from "@/lib/auth";

export const metadata = { title: "sign up · stacked." };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await auth()) redirect("/dashboard");

  return (
    <>
      <AuthNav prompt="already have an account?" label="sign in" href="/signin" />
      <main className="auth">
        <SignupForm />
      </main>
    </>
  );
}
