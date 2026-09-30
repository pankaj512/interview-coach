// @interview-coach/backend - owned fixed-window rate limiter (S8a).
//
// Why owned instead of @fastify/rate-limit: that plugin attaches budgets via
// an `onRoute` hook installed when the plugin executes (deferred to ready()),
// but buildApp adds every route synchronously before ready() - so a
// fire-and-forget `void app.register(rateLimit)` silently limited zero routes
// (S8a audit finding, proven by a max-2 budget that never fired). A root
// `onRequest` hook installs synchronously in buildApp, so budgets provably
// apply - every budget below is covered by `tests/hardening.test.ts`.
//
// Shape: per-client-IP fixed windows (global + tighter budgets on the
// expensive paths). 429s use the shared JSON envelope with retryable:true so
// the browser forwarder backs off and retries with the same call_id.

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
