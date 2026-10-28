"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useHealth } from "@/lib/hooks";

const schema = z
  .object({
    displayName: z.string().trim().max(120).optional(),
    email: z.string().email("Enter a valid email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const { health } = useHealth();
  const supabaseReady = health?.features.supabase ?? false;
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { email: "", password: "", confirm: "", displayName: "" },
  });

  async function onSubmit(values: FormValues) {
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          displayName: values.displayName || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        needsEmailConfirmation?: boolean;
      };
      if (!res.ok) {
        setServerError(json.error?.message ?? "Sign-up failed.");
        return;
      }
      if (json.needsEmailConfirmation) {
        setNeedsConfirm(true);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function enterDemo() {
    setDemoError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/demo/login", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        setDemoError(json.error?.message ?? "Could not start demo mode.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setDemoError("Could not start demo mode. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (needsConfirm) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link. Click it to activate your account, then sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Create your account</CardTitle>
            {!supabaseReady && <Badge variant="demo">Demo available</Badge>}
          </div>
          <CardDescription>
            {supabaseReady
              ? "Practice interviews tailored to real job descriptions."
              : "Real accounts require Supabase Auth, which is not configured on this deployment."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!supabaseReady && (
            <Alert className="mb-4">
              <AlertDescription>
                To enable account creation, set{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in{" "}
                <code className="font-mono text-xs">.env.local</code> (see the README). Until then,
                explore the product in labeled demo mode — no account is created.
              </AlertDescription>
            </Alert>
          )}
          {serverError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name (optional)</Label>
              <Input id="displayName" disabled={!supabaseReady || busy} {...form.register("displayName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                disabled={!supabaseReady || busy}
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                disabled={!supabaseReady || busy}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                disabled={!supabaseReady || busy}
                {...form.register("confirm")}
              />
              {form.formState.errors.confirm && (
                <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!supabaseReady || busy}>
              {!supabaseReady ? "Create account (not configured)" : busy ? "Creating…" : "Create account"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          {demoError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{demoError}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={enterDemo}
            disabled={busy || supabaseReady}
          >
            Continue in demo mode
          </Button>
          <p className="mt-2 text-center text-[11px] text-faint">
            Demo mode does not create a persistent account. It uses an in-memory store with clearly
            labeled non-AI features.
          </p>

          <p className="mt-6 text-center text-sm">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
