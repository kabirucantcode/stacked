import { Suspense } from "react";
import { redirect } from "next/navigation";

import AuthNav from "@/components/AuthNav";
import SigninForm from "@/components/SigninForm";
import { auth } from "@/lib/auth";

export const metadata = { title: "sign in · stacked." };
export const dynamic = "force-dynamic";

export default async function SigninPage() {
  if (await auth()) redirect("/dashboard");

  return (
    <>
      <AuthNav prompt="new here?" label="sign up" href="/signup" />
      <main className="auth">
        {/* SigninForm reads ?next= via useSearchParams, which needs a boundary. */}
        <Suspense fallback={null}>
          <SigninForm />
        </Suspense>
      </main>
    </>
  );
}
