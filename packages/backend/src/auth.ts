// @interview-coach/backend — service-level auth gate (HLD Phase 7, S8a).
//
// Minimal honest boundary: an optional shared-secret bearer token. When
// API_AUTH_TOKEN is set, every /api route except the unauthenticated probes
// (GET /api/health, GET /api/ready) requires
// `Authorization: Bearer <token>` and otherwise 401s (permanent, never
// retried as-is). When unset, the service stays in the historical open
// local-dev mode and logs one startup warning.
//
// This is abuse protection, not user identity: per-user ownership
// ( callers can only touch their own interviews) needs a real identity
// layer (Entra/OIDC) and stays on the S8b deploy track with an ADR.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendApiError } from "./http-errors.js";

export const OPEN_ROUTES: ReadonlySet<string> = new Set([
  "GET /api/health",
  "GET /api/ready",
]);

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers["authorization"];
  if (typeof header !== "string") return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (match === null) return null;
  const token = (match[1] ?? "").trim();
  return token === "" ? null : token;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function registerAuthHook(app: FastifyInstance, authToken: string | undefined): void {
  if (authToken === undefined) {
    app.log.warn("API_AUTH_TOKEN is not set: /api is open (local-dev mode)");
    return;
  }
  app.addHook("onRequest", (request, reply, done) => {
    const key = `${request.method} ${request.url.split("?", 1)[0]}`;
    if (OPEN_ROUTES.has(key)) {
      done();
      return;
    }
    if (!request.url.startsWith("/api/")) {
      done();
      return;
    }
    const presented = extractBearerToken(request);
    if (presented === null || !timingSafeEqual(presented, authToken)) {
      sendApiError(reply, 401, "UNAUTHORIZED", "Missing or invalid bearer token", false);
      return;
    }
    done();
  });
}
