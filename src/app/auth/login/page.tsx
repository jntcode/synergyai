"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { health } = useHealth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabaseReady = health?.features.supabase ?? false;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onBlur" });

  async function onSubmit(values: FormValues) {
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setServerError(json.error?.message ?? "Sign-in failed.");
        return;
      }
      router.push(search.get("next") ?? "/dashboard");
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

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Sign in</CardTitle>
          {!supabaseReady && <Badge variant="demo">Demo available</Badge>}
        </div>
        <CardDescription>
          {supabaseReady
            ? "Use your email and password."
            : "Supabase is not configured on this deployment — email sign-in is disabled. You can explore the full product in labeled demo mode."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {serverError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              autoComplete="current-password"
              disabled={!supabaseReady || busy}
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={!supabaseReady || busy}>
            {busy ? "Working…" : "Sign in"}
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
          disabled={busy || (health?.features.supabase ?? false)}
        >
          Continue in demo mode
        </Button>
        <p className="mt-2 text-center text-[11px] text-faint">
          Demo mode uses an in-memory store and clearly labeled non-AI features. No credentials
          required.
        </p>

        <div className="mt-6 flex justify-between text-sm">
          <Link href="/auth/reset" className="text-primary hover:underline">
            Forgot password?
          </Link>
          <Link href="/auth/signup" className="text-primary hover:underline">
            Create account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
