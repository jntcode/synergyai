"use client";

import { useEffect, useState } from "react";

export interface HealthFeatures {
  supabase: boolean;
  supabaseSecret: boolean;
  openai: boolean;
  heygen: boolean;
  /** Missing/invalid server configuration for a real HeyGen LiveAvatar session. */
  heygenIssues?: string[];
  /** Deployment explicitly requested live video via AVATAR_PROVIDER=heygen. */
  heygenRequested?: boolean;
  avatarProvider: "heygen" | "demo";
  /** Configured auth mode (configuration presence, not a verified connection). */
  auth?: "supabase" | "demo";
  demoMode: boolean;
}

export interface HealthResponse {
  ok: boolean;
  features: HealthFeatures;
}

export function useHealth(): { health: HealthResponse | null; loading: boolean } {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((json: HealthResponse) => {
        if (!cancelled) setHealth(json);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { health, loading };
}

export interface MeResponse {
  profile: { displayName: string | null; preferredLanguage: string } | null;
  user: { id: string; email: string | null; mode: "supabase" | "demo" };
  authConfigured: boolean;
}

export function useMe(enabled = true): {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => void;
} {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    fetch("/api/settings/profile")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setMe(json);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick, enabled]);
  return { me, loading, refresh: () => setTick((t) => t + 1) };
}
