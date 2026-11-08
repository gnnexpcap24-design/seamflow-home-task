import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account | Hot Dog or Not" };

export default function SignupPage() {
  return (
    <AppShell>
      <AuthForm mode="signup" />
    </AppShell>
  );
}
