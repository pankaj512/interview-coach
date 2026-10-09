// @interview-coach/api - owned fixed-window rate limiter.
//
// Owns: per-client-IP budgets with 429s in the shared retryable envelope.
// Surprising: hand-rolled, not @fastify/rate-limit
// (its deferred hook silently limited zero synchronously-added routes);
// the root onRequest hook applies provably, covered by hardening tests.
//
// History: S8a; see docs/SESSION_HANDOFF.md.

export interface RateBudget {
  readonly max: number;
  readonly windowMs: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly counters = new Map<string, Counter>();
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;
  private readonly maxKeys: number;

  constructor(options: { sweepIntervalMs?: number; maxKeys?: number } = {}) {
    this.maxKeys = options.maxKeys ?? 5000;
    const sweepMs = options.sweepIntervalMs ?? 60_000;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      // Never hold the process open for a janitor timer.
      if (typeof this.sweepTimer === "object" && "unref" in this.sweepTimer) {
        (this.sweepTimer as unknown as { unref(): void }).unref();
      }
    } else {
      this.sweepTimer = null;
    }
  }

  check(
    bucket: string,
    key: string,
    budget: RateBudget,
    now: number = Date.now(),
  ): { allowed: boolean; retryAfterMs: number } {
    const mapKey = `${bucket}:${key}`;
    const existing = this.counters.get(mapKey);
    if (existing === undefined || now >= existing.resetAt) {
      this.evictIfFull();
      this.counters.set(mapKey, { count: 1, resetAt: now + budget.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (existing.count < budget.max) {
      existing.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }

  close(): void {
    if (this.sweepTimer !== null) clearInterval(this.sweepTimer);
    this.counters.clear();
  }

  private evictIfFull(): void {
    while (this.counters.size >= this.maxKeys) {
      const oldest = this.counters.keys().next();
      if (oldest.done === true) break;
      this.counters.delete(oldest.value);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [mapKey, counter] of this.counters) {
      if (now >= counter.resetAt) this.counters.delete(mapKey);
    }
  }
}

export type RateBucket =
  | "toolExec"
  | "voiceMint"
  | "codeRun"
  | "auth"
  | "recommendation"
  | "global"
  | "exempt";

export function bucketForRoute(method: string, pathname: string): RateBucket {
  // Liveness/readiness probes and non-API traffic are never limited.
  if (method === "GET" && (pathname === "/api/health" || pathname === "/api/ready")) {
    return "exempt";
  }
  if (!pathname.startsWith("/api/")) return "exempt";
  // S8c: credential endpoints get the strictest budget (brute-force shield).
  if (method === "POST" && pathname.startsWith("/api/auth/")) return "auth";
  if (method === "POST" && pathname.endsWith("/tool-exec")) return "toolExec";
  if (method === "POST" && pathname.endsWith("/voice-session")) return "voiceMint";
  if (method === "POST" && pathname.includes("/submissions/") && pathname.endsWith("/runs")) {
    return "codeRun";
  }
  // Phase 4: generation hits the server-side LLM, so it gets its own budget.
  if (method === "POST" && pathname === "/api/recommendations") return "recommendation";
  return "global";
}
