// S8c accounts: email normalization/validation + session expiry.
import { describe, expect, it } from "vitest";
import { asUserId } from "../src/ids.js";
import {
  createUser,
  normalizeEmail,
  sessionExpired,
  validEmail,
  type UserSession,
} from "../src/user.js";
import { must, mustErr } from "./helpers.js";

describe("user accounts", () => {
  it("normalizes email to lowercase.trimmed", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(validEmail("user@example.com")).toBe(true);
    expect(validEmail("USER@EXAMPLE.COM")).toBe(true);
  });

  it("rejects malformed emails", () => {
    for (const bad of ["", "plain", "a@b", "a @b.com", "a@b com", "@b.com", "a@"]) {
      expect(validEmail(bad)).toBe(false);
    }
  });

  it("creates users with normalized email", () => {
    const user = must(createUser({ displayName: " Ada ", email: "ADA@Example.COM" }));
    expect(user.email).toBe("ada@example.com");
    expect(user.displayName).toBe("Ada");
    expect(mustErr(createUser({ displayName: "Ada", email: "not-an-email" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(mustErr(createUser({ displayName: "  ", email: "a@b.com" }))).toBe("VALIDATION_ERROR");
  });

  it("detects expired sessions", () => {
    const base: UserSession = {
      tokenHash: "h",
      userId: asUserId("user_1"),
      createdAt: new Date("2026-09-11T10:00:00.000Z"),
      expiresAt: new Date("2026-09-11T11:00:00.000Z"),
    };
    expect(sessionExpired(base, new Date("2026-09-11T10:59:59.999Z"))).toBe(false);
    expect(sessionExpired(base, new Date("2026-09-11T11:00:00.000Z"))).toBe(true);
  });
});
