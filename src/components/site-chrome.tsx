"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogOut, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { cn, initialsOf } from "@/lib/utils";
import { useMe } from "@/lib/hooks";

const PUBLIC_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/about", label: "About" },
] as const;

// Module scope: evaluated once at build. Copyright year only needs to be
// correct per deployment, not per request (and `new Date()` inside a client
// component blocks prerendering under cacheComponents).
const FOOTER_YEAR = new Date().getFullYear();

function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-baseline gap-1.5 text-[15px] font-semibold tracking-[-0.02em] text-foreground",
        className,
      )}
    >
      <span>SynergyAI</span>
      <span
        className="size-1.5 translate-y-[-1px] rounded-full bg-primary transition-transform duration-200 group-hover:scale-125"
        aria-hidden
      />
    </Link>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isDashboard = pathname.startsWith("/dashboard");
  const { me } = useMe(isDashboard);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Wordmark />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {isDashboard ? (
            <>
              <Link
                href="/dashboard"
                className={cn(
                  "text-sm transition-colors hover:text-foreground",
                  pathname === "/dashboard" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/settings"
                className={cn(
                  "text-sm transition-colors hover:text-foreground",
                  pathname.startsWith("/dashboard/settings")
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                Settings
              </Link>
              <Link
                href="/start"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                New practice
              </Link>
              {me && (
                <div className="ml-2 flex items-center gap-1 border-l border-border pl-4">
                  <span
                    className="mr-1 flex size-7 items-center justify-center rounded-full bg-elevated text-[10px] font-semibold text-muted-foreground"
                    aria-hidden
                  >
                    {initialsOf(me.profile?.displayName ?? me.user.email ?? "You")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={signOut}
                    aria-label="Sign out"
                    className="size-8"
                  >
                    <LogOut />
                  </Button>
                </div>
              )}
            </>
          ) : (
            PUBLIC_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))
          )}
          {!isDashboard && (
            <Button asChild size="sm" className="ml-2 h-9 px-4">
              <Link href="/start">
                Start practicing
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          )}
        </nav>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground md:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-5 py-5 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {isDashboard ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  Settings
                </Link>
                <Link
                  href="/start"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  New practice
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  className="rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                {PUBLIC_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
                <Button asChild className="mt-2 w-full" size="lg">
                  <Link href="/start" onClick={() => setOpen(false)}>
                    Start practicing
                    <ArrowUpRight aria-hidden />
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {BRAND.description}
            </p>
          </div>
          <nav
            className="grid grid-cols-2 gap-x-16 gap-y-6 text-sm"
            aria-label="Footer"
          >
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-faint">
                Practice
              </p>
              <div className="flex flex-col gap-2.5">
                <Link href="/start" className="text-muted-foreground hover:text-foreground">
                  Start an interview
                </Link>
                <Link href="/#how-it-works" className="text-muted-foreground hover:text-foreground">
                  How it works
                </Link>
                <Link href="/#features" className="text-muted-foreground hover:text-foreground">
                  Features
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-faint">
                Project
              </p>
              <div className="flex flex-col gap-2.5">
                <Link href="/about" className="text-muted-foreground hover:text-foreground">
                  About
                </Link>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  Privacy
                </Link>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                  Terms
                </Link>
              </div>
            </div>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs leading-5 text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {FOOTER_YEAR} {BRAND.name}. A practice product — not a hiring system.
          </p>
          <p className="max-w-md sm:text-right">
            Demo interviews use a still portrait and simulated dialogue. Sessions are not reviewed
            by a human.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn("size-2 rounded-full", ok ? "bg-success" : "bg-border-strong")}
        aria-hidden
      />
      {label}
    </span>
  );
}
