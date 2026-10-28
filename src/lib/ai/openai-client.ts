import "server-only";
import OpenAI from "openai";
import { getServerEnv, isOpenAIConfigured, openAIFastModel, openAIModel } from "@/lib/env";
import { logger } from "@/lib/logger";

let client: OpenAI | null = null;

export function isOpenAIReady(): boolean {
  return isOpenAIConfigured();
}

export function getOpenAI(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw new Error(
      "OpenAI is not configured. Set OPENAI_API_KEY, or use demo mode which is clearly labeled in the UI.",
    );
  }
  if (!client) {
    client = new OpenAI({
      apiKey: getServerEnv().OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 2,
    });
  }
  return client;
}

export function modelMain(): string {
  return openAIModel();
}

export function modelFast(): string {
  return openAIFastModel();
}

export class AIUnavailableError extends Error {
  constructor(message = "AI features are unavailable (missing OPENAI_API_KEY).") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

/** Wrap an AI call with structured error logging (never logs secrets). */
export async function withAiLogging<T>(
  op: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info("ai.op.ok", { op, ms: Date.now() - started, ...meta });
    return result;
  } catch (err) {
    logger.error("ai.op.failed", {
      op,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      ...meta,
    });
    throw err;
  }
}
