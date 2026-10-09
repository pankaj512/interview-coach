// @interview-coach/api - HTTP error envelope and domain mapping.
//
// Owns: every error response as `{ ok: false, error: { code, message,
// retryable } }` plus the domain-to-HTTP mapping. `retryable` mirrors the
// browser forwarder contract: retry only timeout/network/5xx. Domain
// failures are permanent and stored for replay.
//
// History: S3; see docs/SESSION_HANDOFF.md.

import type { FastifyReply } from "fastify";
import type { DomainError, DomainErrorCode } from "@interview-coach/core";

export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ApiErrorBody {
  readonly ok: false;
  readonly error: ApiErrorPayload;
}

const DOMAIN_HTTP: Record<DomainErrorCode, { status: number; retryable: boolean }> = {
  VALIDATION_ERROR: { status: 400, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  ILLEGAL_TRANSITION: { status: 409, retryable: false },
  NO_CURRENT_PROBLEM: { status: 409, retryable: false },
  CONFLICT: { status: 409, retryable: false },
  // Quota/capacity: transient, so the forwarder may back off and retry.
  RATE_LIMITED: { status: 429, retryable: true },
};

export function domainErrorBody(error: DomainError): {
  status: number;
  body: ApiErrorBody;
} {
  const mapping = DOMAIN_HTTP[error.code];
  return {
    status: mapping.status,
    body: {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: mapping.retryable,
      },
    },
  };
}

export function sendDomainError(reply: FastifyReply, error: DomainError): FastifyReply {
  const { status, body } = domainErrorBody(error);
  return reply.status(status).send(body);
}

export function sendApiError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): FastifyReply {
  const body: ApiErrorBody = { ok: false, error: { code, message, retryable } };
  return reply.status(status).send(body);
}
