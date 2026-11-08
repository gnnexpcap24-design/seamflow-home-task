"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CircleCheckIcon } from "lucide-react";
import { z } from "zod";
import { ErrorAlert } from "@/components/error-alert";
import { useQuota } from "@/components/quota-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldErrors = { company?: string; billingEmail?: string };

const FormSchema = z.object({
  company: z.string().trim().min(1, "Enter your company name.").max(100, "Use at most 100 characters."),
  billingEmail: z.email("Enter a valid email address."),
});

export function UpgradeForm() {
  const { refresh } = useQuota();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = FormSchema.safeParse({ company: form.get("company"), billingEmail: String(form.get("billingEmail") ?? "").trim() });
    setFailure(null);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      return setErrors({ company: fields.company?.[0], billingEmail: fields.billingEmail?.[0] });
    }
    setErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) throw new Error("upgrade failed");
      await refresh();
      setDone(true);
    } catch {
      setFailure("We couldn't complete the upgrade. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <UpgradeSuccess />;

  return (
    <Card className="mx-auto w-full max-w-md [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">Upgrade to Pro</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert className="p-3">
          <AlertDescription>Demo checkout. No payment is taken and no card details are collected.</AlertDescription>
        </Alert>
        <p className="text-sm">Plan: Pro, unlimited scans.</p>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field id="company" label="Company name" autoComplete="organization" error={errors.company} />
          <Field id="billingEmail" label="Billing email" type="email" autoComplete="email" error={errors.billingEmail} />
          {failure && <ErrorAlert title="Upgrade failed" message={failure} />}
          <Button type="submit" className="h-11" disabled={submitting}>
            {submitting ? "Please wait..." : "Confirm upgrade"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type FieldProps = { id: string; label: string; error?: string; type?: string; autoComplete?: string };

function Field({ id, label, error, type = "text", autoComplete }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        className="h-11"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className="text-sm text-error-foreground">{error}</p>}
    </div>
  );
}

function UpgradeSuccess() {
  return (
    <Card className="mx-auto w-full max-w-md [--card-spacing:--spacing(6)]">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-hotdog-foreground">
          <CircleCheckIcon aria-hidden="true" className="size-6" />
          <p className="text-lg font-semibold">You are now on Pro</p>
        </div>
        <p className="text-sm text-muted-foreground">Scans are unlimited. History and batch upload will appear here as they are released.</p>
        <Link href="/" className={cn(buttonVariants(), "h-11 w-fit px-5")}>Analyze an image</Link>
      </CardContent>
    </Card>
  );
}
