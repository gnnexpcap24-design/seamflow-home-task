import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Log in | Hot Dog or Not" };

export default function LoginPage() {
  return (
    <AppShell>
      <AuthForm mode="login" />
    </AppShell>
  );
}
