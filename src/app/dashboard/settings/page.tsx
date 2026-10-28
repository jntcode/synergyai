"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, Loader2, LogOut, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useHealth, useMe } from "@/lib/hooks";
import { LANGUAGE_LABELS, interviewLanguageSchema } from "@/lib/ai/schemas";

const schema = z.object({
  displayName: z.string().trim().max(120, "Display name is too long").optional(),
  preferredLanguage: interviewLanguageSchema,
});
type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const router = useRouter();
  const { me, loading, refresh } = useMe();
  const { health } = useHealth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      displayName: me?.profile?.displayName ?? "",
      preferredLanguage:
        (me?.profile?.preferredLanguage as FormValues["preferredLanguage"]) ?? "en",
    },
  });

  async function onSubmit(values: FormValues) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: values.displayName || null,
          preferredLanguage: values.preferredLanguage,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        setError(json.error?.message ?? "Could not save settings.");
        return;
      }
      setSaved(true);
      refresh();
    } catch {
      setError("Network error while saving.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllData() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/data", { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        setError(json.error?.message ?? "Could not delete data.");
        return;
      }
      if (me?.authConfigured && me.user.mode === "supabase") {
        await fetch("/api/auth/logout", { method: "POST" });
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error while deleting data.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-border" />
        <div className="h-64 animate-pulse rounded-xl bg-border" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile, language preference, and data controls.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Account */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Account</CardTitle>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
          <CardDescription>
            {me?.user.email ?? "Demo account"} ·{" "}
            <Badge variant={me?.user.mode === "demo" ? "demo" : "secondary"}>
              {me?.user.mode === "demo" ? "Demo mode" : "Supabase auth"}
            </Badge>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Used to personalize your interview experience.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Ana Silva"
                {...form.register("displayName")}
              />
              {form.formState.errors.displayName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.displayName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredLanguage">Preferred language</Label>
              <Select
                value={form.watch("preferredLanguage")}
                onValueChange={(v) =>
                  form.setValue("preferredLanguage", v as FormValues["preferredLanguage"])
                }
              >
                <SelectTrigger id="preferredLanguage" aria-label="Preferred language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LANGUAGE_LABELS) as Array<keyof typeof LANGUAGE_LABELS>).map(
                    (code) => (
                      <SelectItem key={code} value={code}>
                        {LANGUAGE_LABELS[code]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Save aria-hidden />
                )}
                Save changes
              </Button>
              {saved && (
                <span className="text-sm text-success" role="status">
                  Saved.
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Integrations status */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>What is configured on this deployment right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <StatusRow
            label="Accounts (Supabase)"
            ok={health?.features.supabase ?? false}
            okText="Configured"
            offText="Not configured — demo login available"
          />
          <StatusRow
            label="AI analysis (OpenAI)"
            ok={health?.features.openai ?? false}
            okText="Configured"
            offText="Not configured — labeled demo heuristics used"
          />
          <StatusRow
            label="Live avatar (HeyGen)"
            ok={Boolean(health?.features.heygen && health?.features.avatarProvider === "heygen")}
            okText="Configured — real LiveAvatar video"
            offText={
              health?.features.heygenRequested
                ? "Requested but incomplete — live starts will show a configuration error"
                : "Not configured — labeled demo interviewer used"
            }
          />
          {health?.features.heygenRequested && (health?.features.heygenIssues?.length ?? 0) > 0 && (
            <p className="rounded-md border border-warning/25 bg-warning-soft/40 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              Missing:{" "}
              <code className="font-mono text-[10px]">
                {health.features.heygenIssues?.join(", ")}
              </code>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Data */}
      <Card className="border-destructive/25">
        <CardHeader>
          <CardTitle className="text-destructive">Your data</CardTitle>
          <CardDescription>
            Interviews, transcripts, evaluations, and reports. Deletion is permanent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden />
            Delete all my data
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all interview data?</DialogTitle>
            <DialogDescription>
              This permanently removes every interview, transcript, evaluation, and report for your
              account. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteAllData} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  offText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  offText: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
      <span>{label}</span>
      <Badge variant={ok ? "success" : "secondary"}>{ok ? okText : offText}</Badge>
    </div>
  );
}
