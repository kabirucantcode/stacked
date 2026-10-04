import AuthNav from "@/components/AuthNav";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata = { title: "reset your password · stacked." };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthNav prompt="remembered it?" label="sign in" href="/signin" />
      <main className="auth">
        <ForgotPasswordForm />
      </main>
    </>
  );
}
