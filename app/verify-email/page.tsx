import { Suspense } from "react";

import AuthNav from "@/components/AuthNav";
import VerifyEmail from "@/components/VerifyEmail";

export const metadata = { title: "confirm your email · stacked." };
export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <>
      <AuthNav prompt="already set up?" label="sign in" href="/signin" />
      <main className="auth">
        {/* VerifyEmail reads ?token= via useSearchParams, which needs a boundary. */}
        <Suspense fallback={null}>
          <VerifyEmail />
        </Suspense>
      </main>
    </>
  );
}
