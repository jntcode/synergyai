import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SiteFooter, SiteNav } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Pricing" };

const TIERS = [
  {
    name: "Practice (preview)",
    price: "Free while in preview",
    description: "Full product flow while we validate the platform with early users.",
    features: [
      "Job-description analysis & interview plan",
      "Demo interviewer (text + browser speech)",
      "Coaching report & learning plan",
      "English & Brazilian Portuguese",
    ],
    cta: "Start practicing",
    highlighted: true,
    disabled: false,
  },
  {
    name: "Live avatar (coming soon)",
    price: "Not yet available",
    description:
      "Live HeyGen avatar interviews require a paid provider plan and will be metered when billing ships.",
    features: [
      "Human-like AI video interviewer",
      "Adaptive follow-ups by voice",
      "Live transcript & evidence-based report",
    ],
    cta: "Join waitlist later",
    highlighted: false,
    disabled: true,
  },
] as const;

export default function PricingPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-5xl flex-1 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="warning">Billing not yet implemented</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="mt-3 text-muted-foreground">
            We do not process payments yet. Nothing on this page is a paid offer — no fake checkout,
            no simulated purchases.
          </p>
        </div>

        <Alert className="mx-auto mt-8 max-w-2xl" variant="warning">
          <AlertTitle>Transparent placeholder</AlertTitle>
          <AlertDescription>
            Live avatar sessions burn provider credits (HeyGen LiveAvatar: 2 credits/minute; free
            tier caps sessions at 2 minutes). Metered plans will be introduced after the core
            experience stabilizes. See <code className="font-mono text-xs">docs/architecture.md</code>{" "}
            for provider pricing sources.
          </AlertDescription>
        </Alert>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {TIERS.map((tier) => (
            <Card key={tier.name} className={tier.highlighted ? "border-primary shadow-lift" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {tier.highlighted && <Badge>Current</Badge>}
                </div>
                <p className="pt-2 text-2xl font-semibold tracking-tight">{tier.price}</p>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="mb-6 space-y-2 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {tier.disabled ? (
                    <Button className="w-full" variant="secondary" disabled>
                      Not yet available
                    </Button>
                  ) : (
                    <Button asChild className="w-full">
                      <Link href="/auth/signup">{tier.cta}</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
