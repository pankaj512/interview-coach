// HTTP error envelope + domain -> HTTP mapping (S3).
// Every error response is JSON: { ok: false, error: { code, message, retryable } }.
// `retryable` mirrors the browser forwarder contract (frozen section 5):
// retry only timeout/network/5xx/retryable:true. Domain failures are
// permanent (retryable:false) and stored for replay by the idempotency store.

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
