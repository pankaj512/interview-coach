import type { UserId } from "./ids.js";
import { newUserId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

export interface User {
  readonly id: UserId;
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: Date;
}

export interface CreateUserInput {
  readonly displayName: string;
  readonly email: string;
  readonly now?: Date;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Canonical form: trimmed + lowercased. All lookups must use this so
// `User@x.com` and `user@x.com` are the same account.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function createUser(input: CreateUserInput): Result<User> {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    return err(domainError("VALIDATION_ERROR", "displayName must not be empty"));
  }
  if (displayName.length > 120) {
    return err(domainError("VALIDATION_ERROR", "displayName must be at most 120 characters"));
  }
  if (!validEmail(input.email)) {
    return err(domainError("VALIDATION_ERROR", "email must be a valid address"));
  }
  return ok({
    id: newUserId(),
    displayName,
    email: normalizeEmail(input.email),
    createdAt: input.now ?? new Date(),
  });
}

// S8c accounts (HLD 7.1): self-registered local credentials. Password hashing
// and token randomness live at the backend boundary (node:crypto); the domain
// owns only these data shapes plus the repository contracts below.
export interface UserAccount {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string;
  /** Opaque password hash (format owned by the backend hasher). */
  readonly passwordHash: string;
  readonly createdAt: Date;
}

export interface UserSession {
  /** SHA-256 hex of the bearer token; the raw token is never stored. */
  readonly tokenHash: string;
  readonly userId: UserId;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export function sessionExpired(session: UserSession, now: Date = new Date()): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}
