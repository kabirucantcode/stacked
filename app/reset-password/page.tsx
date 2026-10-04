import { Suspense } from "react";

import AuthNav from "@/components/AuthNav";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export const metadata = { title: "set a new password · stacked." };
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <>
      <AuthNav prompt="remembered it?" label="sign in" href="/signin" />
      <main className="auth">
        {/* ResetPasswordForm reads ?token= via useSearchParams, which needs a boundary. */}
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </>
  );
}
