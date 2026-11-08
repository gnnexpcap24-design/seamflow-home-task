"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { useQuota } from "@/components/quota-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserClient } from "@/lib/supabase/browser";

type Mode = "login" | "signup";
type FieldErrors = { email?: string; password?: string };

const MIN_PASSWORD_LENGTH = 8;

const COPY = {
  login: {
    title: "Log in",
    submit: "Log in",
    switchText: "No account yet?",
    switchLabel: "Create one",
    switchHref: "/signup",
    password: z.string().min(1, "Enter your password."),
  },
  signup: {
    title: "Create a free account",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLabel: "Log in",
    switchHref: "/login",
    password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
  },
} as const;

function validate(mode: Mode, email: string, password: string): FieldErrors {
  const schema = z.object({ email: z.email("Enter a valid email address."), password: COPY[mode].password });
  const result = schema.safeParse({ email, password });
  if (result.success) return {};
  const fields = result.error.flatten().fieldErrors;
  return { email: fields.email?.[0], password: fields.password?.[0] };
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { refresh } = useQuota();
  const copy = COPY[mode];
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function authenticate(email: string, password: string) {
    const supabase = getBrowserClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? "Email or password is incorrect." : null, needsConfirmation: false };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const fieldErrors = validate(mode, email, password);
    setErrors(fieldErrors);
    setFormError(null);
    if (fieldErrors.email || fieldErrors.password) return;

    setSubmitting(true);
    const outcome = await authenticate(email, password);
    setSubmitting(false);
    if (outcome.error) return setFormError(outcome.error);
    if (outcome.needsConfirmation) return setNotice("Check your email to confirm your account, then log in.");
    await refresh();
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="mx-auto w-full max-w-md [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">{copy.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="h-11"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && <p id="email-error" className="text-sm text-error-foreground">{errors.email}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="h-11 pr-12"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "password-error" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                className="absolute top-0 right-0 size-11"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
              </Button>
            </div>
            {errors.password && <p id="password-error" className="text-sm text-error-foreground">{errors.password}</p>}
          </div>

          {formError && (
            <Alert className="border-error-foreground/20 bg-error p-3 text-error-foreground">
              <AlertDescription className="text-error-foreground">{formError}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert className="p-3">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="h-11" disabled={submitting}>
            {submitting ? "Please wait..." : copy.submit}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          {copy.switchText}{" "}
          <Link href={copy.switchHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {copy.switchLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
