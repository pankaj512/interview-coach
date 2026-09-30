// @interview-coach/backend - service auth gate + caller ownership (S8a/S8c).
//
// Two credential kinds (HLD 7.1, ADR-001):
//   service - the shared API_AUTH_TOKEN (CLI/admin; bypasses ownership).
//   user    - an opaque session token from /api/auth/* (ownership enforced).
// Open local-dev mode (no API_AUTH_TOKEN) allows anonymous callers with
// client-supplied candidate IDs, exactly like S7 and earlier; user sessions
// still resolve there when presented.
//
// Per-user ownership (HLD 7.2): any caller authenticated as a user may only
// touch interviews whose candidateId is their own user id. Foreign or missing
// interviews both read 404 (no existence oracle). The model never calls
// auth routes; per-interview authz for OIDC/social (S8d) reuses the same
// session rows, so no route changes are needed then.

import { createHash, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { asInterviewId, type RepositorySet, type UserId } from "@interview-coach/domain";
import { sendApiError } from "./http-errors.js";

export type Caller =
  | { readonly kind: "anonymous" }
  | { readonly kind: "service" }
  | { readonly kind: "user"; readonly userId: UserId; readonly displayName: string };

declare module "fastify" {
  interface FastifyRequest {
    caller?: Caller;
  }
}

export const OPEN_ROUTES: ReadonlySet<string> = new Set([
  "GET /api/health",
  "GET /api/ready",
  "POST /api/auth/register",
  "POST /api/auth/login",
]);

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers["authorization"];
  if (typeof header !== "string") return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (match === null) return null;
  const token = (match[1] ?? "").trim();
  return token === "" ? null : token;
}

// F7-5: compare fixed-length SHA-256 digests so the comparison does not leak
// length (the previous early return on length mismatch was an oracle).
function timingSafeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return nodeTimingSafeEqual(da, db);
}

export interface AuthGate {
  readonly authToken: string | undefined;
  /** Live-session lookup; null when the token is not a user session. */
  readonly resolveUser: (
    token: string,
  ) => Promise<{ userId: UserId; displayName: string } | null>;
}

export function registerAuthHook(app: FastifyInstance, gate: AuthGate): void {
  if (gate.authToken === undefined) {
    // F7-4/F8-2: fail closed in production. Open mode is a deliberate opt-in,
    // never an accident of a missing env var.
    if (
      process.env["NODE_ENV"] === "production" &&
      process.env["ALLOW_ANONYMOUS"] !== "true"
    ) {
      throw new Error(
        "Refusing to start: NODE_ENV=production with no API_AUTH_TOKEN. " +
          "Configure auth, or set ALLOW_ANONYMOUS=true to run open explicitly.",
      );
    }
    app.log.warn("API_AUTH_TOKEN is not set: /api is open (local-dev mode)");
  }
  app.addHook("onRequest", async (request, reply) => {
    const key = `${request.method} ${request.url.split("?", 1)[0]}`;
    if (OPEN_ROUTES.has(key)) {
      return;
    }
    if (!request.url.startsWith("/api/")) {
      return;
    }
    const presented = extractBearerToken(request);
    if (presented !== null) {
      if (gate.authToken !== undefined && timingSafeEqual(presented, gate.authToken)) {
        request.caller = { kind: "service" };
        return;
      }
      const user = await gate.resolveUser(presented);
      if (user !== null) {
        request.caller = { kind: "user", userId: user.userId, displayName: user.displayName };
        return;
      }
    }
    if (gate.authToken === undefined) {
      request.caller = { kind: "anonymous" };
      return;
    }
    sendApiError(reply, 401, "UNAUTHORIZED", "Missing or invalid bearer token", false);
  });
}

// Ownership enforcement (HLD 7.2). Runs as a preHandler so the auth hook has
// already resolved the caller. Service and anonymous (open-mode) callers pass
// through; user callers are scoped to their own interviews.
//
// F7-6: this re-reads the interview in the hook, and the handler reads it
// again - an accepted extra round-trip (and a tiny window where the two reads
// can disagree) in exchange for a single, uniform ownership chokepoint. The
// resolved entity is not attached to the request; revisit if the read cost
// matters.
export function registerOwnershipHook(
  app: FastifyInstance,
  repos: Pick<RepositorySet, "interviews">,
): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathname = request.url.split("?", 1)[0] ?? "/";
    const match = /^\/api\/interviews\/([^/]+)/.exec(pathname);
    if (match === null) return;
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") return;
    const interviewId = match[1] ?? "";
    const interview = await repos.interviews.findById(asInterviewId(interviewId));
    if (interview === null || interview.candidateId !== caller.userId) {
      sendApiError(reply, 404, "NOT_FOUND", `Interview ${interviewId} does not exist`, false);
    }
  });
}
