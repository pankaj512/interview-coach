// @interview-coach/backend - local account service (HLD 7.1, S8c).
//
// Self-registered email+password accounts with opaque bearer sessions.
// Cryptography: scrypt for passwords (N=16384, r=8, p=1), 32-byte random
// session tokens stored as SHA-256 hex (the raw token is shown once at
// login/register and never persisted). Timing-safe comparisons throughout.
//
// Seams for S8d (social sign-in): this module owns the *local* credential
// path only. OIDC/Social arrives as a second issuer that mints the same
// UserSession rows - routes resolve a session, never an issuer - so no route
// changes are needed when Google/GitHub/Microsoft land.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import {
  createUser,
  normalizeEmail,
  sessionExpired,
  validEmail,
  type RepositorySet,
  type UserAccount,
  type UserId,
  type UserSession,
} from "@interview-coach/domain";
import { domainError, type DomainError } from "@interview-coach/domain";
import type { Result } from "@interview-coach/domain";
import { err, ok } from "@interview-coach/domain";

// F7-3: shorter default session lifetime for the stored bearer (was 30 days).
export const SESSION_TTL_MS_DEFAULT = 7 * 24 * 60 * 60 * 1000;

// F7-1: N=2^15 is OWASP's scrypt absolute floor (was 2^14). The hash format
// version is bumped to v2 so pre-existing v1 hashes are invalidated (pre-prod,
// no data migration needed).
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 32;
const KEY_BYTES = 64;
// Node's scrypt default maxmem (32 MiB) is below 128*N*r for N=2^15, r=8.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

// F7-2: per-account brute-force lockout (in-memory, single-instance MVP).
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;

function b64Encode(raw: Buffer): string {
  return raw.toString("base64");
}

function b64Decode(raw: string): Buffer | null {
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 0) return null;
    return decoded;
  } catch {
    return null;
  }
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM }, (error, derived) => {
      if (error !== undefined && error !== null) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt);
  return `scrypt$v2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64Encode(salt)}$${b64Encode(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v2") return false;
  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  const salt = b64Decode(parts[5] ?? "");
  const expected = b64Decode(parts[6] ?? "");
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (salt === null || expected === null || expected.length !== KEY_BYTES) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: n, r, p, maxmem: SCRYPT_MAXMEM }, (error, derived) => {
      if (error !== undefined && error !== null) reject(error);
      else resolve(derived as Buffer);
    });
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function mintSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface RegisterInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export interface AuthenticatedSession {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly token: string;
  readonly expiresAt: Date;
}

export interface UserServiceDeps {
  readonly users: RepositorySet["users"];
  readonly sessions: RepositorySet["sessions"];
  readonly sessionTtlMs?: number;
  readonly now?: () => Date;
}

export class UserService {
  private readonly users: RepositorySet["users"];
  private readonly sessions: RepositorySet["sessions"];
  private readonly sessionTtlMs: number;
  private readonly clock: () => Date;
  // email -> failed attempt counter + lockout window (F7-2).
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(deps: UserServiceDeps) {
    this.users = deps.users;
    this.sessions = deps.sessions;
    this.sessionTtlMs = deps.sessionTtlMs ?? SESSION_TTL_MS_DEFAULT;
    this.clock = deps.now ?? (() => new Date());
  }

  async register(input: RegisterInput): Promise<Result<AuthenticatedSession, DomainError>> {
    if (typeof input.password !== "string" || input.password.length < 8) {
      return err(domainError("VALIDATION_ERROR", "password must be at least 8 characters"));
    }
    if (input.password.length > 128) {
      return err(domainError("VALIDATION_ERROR", "password must be at most 128 characters"));
    }
    if (!validEmail(input.email)) {
      return err(domainError("VALIDATION_ERROR", "email must be a valid address"));
    }
    const email = normalizeEmail(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing !== null) {
      // Self-service registration: duplicate is a plain conflict. Account
      // enumeration via this signal is accepted pre-prod (see ADR-001).
      return err(domainError("CONFLICT", "email is already registered"));
    }
    const created = createUser({
      displayName: input.displayName,
      email,
      now: this.clock(),
    });
    if (!created.ok) return err(created.error);
    const account: UserAccount = {
      id: created.value.id,
      email: created.value.email,
      displayName: created.value.displayName,
      passwordHash: await hashPassword(input.password),
      createdAt: created.value.createdAt,
    };
    await this.users.save(account);
    return ok(await this.openSession(account));
  }

  // Unknown email and wrong password are indistinguishable (401 at the
  // route) so neither signal leaks account existence. Repeated failures lock
  // the account for a window (F7-2). NOTE: password reset / email verification
  // remain open (no mail transport); S8d account management owns them.
  async login(email: string, password: string): Promise<AuthenticatedSession | null> {
    if (!validEmail(email) || typeof password !== "string" || password === "") return null;
    const normalized = normalizeEmail(email);
    const now = this.clock();
    const locked = this.failures.get(normalized);
    if (locked !== undefined && locked.lockedUntil > now.getTime()) return null;
    const account = await this.users.findByEmail(normalized);
    if (account === null) {
      this.recordFailure(normalized, now);
      return null;
    }
    if (!(await verifyPassword(password, account.passwordHash))) {
      this.recordFailure(normalized, now);
      return null;
    }
    this.failures.delete(normalized);
    return this.openSession(account);
  }

  private recordFailure(email: string, now: Date): void {
    const current = this.failures.get(email) ?? { count: 0, lockedUntil: 0 };
    const count = current.count + 1;
    this.failures.set(email, {
      count,
      lockedUntil: count >= MAX_FAILED_ATTEMPTS ? now.getTime() + LOCKOUT_MS : 0,
    });
  }

  async logout(token: string): Promise<boolean> {
    if (token === "") return false;
    return this.sessions.deleteByTokenHash(hashSessionToken(token));
  }

  async resolveSession(token: string): Promise<UserAccount | null> {
    if (token === "") return null;
    const session = await this.sessions.findByTokenHash(hashSessionToken(token));
    if (session === null) return null;
    const now = this.clock();
    if (sessionExpired(session, now)) {
      await this.sessions.deleteByTokenHash(session.tokenHash);
      return null;
    }
    const account = await this.users.findById(session.userId);
    if (account === null) {
      await this.sessions.deleteByTokenHash(session.tokenHash);
      return null;
    }
    return account;
  }

  private async openSession(account: UserAccount): Promise<AuthenticatedSession> {
    const now = this.clock();
    const minted = mintSessionToken();
    const session: UserSession = {
      tokenHash: minted.tokenHash,
      userId: account.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionTtlMs),
    };
    await this.sessions.save(session);
    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
      token: minted.token,
      expiresAt: session.expiresAt,
    };
  }
}
