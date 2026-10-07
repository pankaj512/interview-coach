// Phase 2 profile: taxonomy config + create/edit validation.
import { describe, expect, it } from "vitest";
import { asUserId } from "../src/ids.js";
import {
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPES,
  PROFILE_LEVELS,
  PROFILE_ROLE_LABELS,
  PROFILE_ROLES,
  createUserProfile,
  isInterviewType,
  isProfileLevel,
  isProfileRole,
  updateUserProfile,
} from "../src/profile.js";
import { must, mustErr } from "./helpers.js";

const USER = asUserId("user_1");
const NOW = new Date("2026-09-14T10:00:00.000Z");

describe("profile taxonomy", () => {
  it("covers every key with a label", () => {
    for (const value of INTERVIEW_TYPES) {
      expect(INTERVIEW_TYPE_LABELS[value]).toBeTruthy();
      expect(isInterviewType(value)).toBe(true);
    }
    for (const value of PROFILE_ROLES) {
      expect(PROFILE_ROLE_LABELS[value]).toBeTruthy();
      expect(isProfileRole(value)).toBe(true);
    }
    for (const value of PROFILE_LEVELS) {
      expect(isProfileLevel(value)).toBe(true);
    }
    expect(isProfileRole("ceo")).toBe(false);
    expect(isProfileLevel("god")).toBe(false);
    expect(isInterviewType("system_design")).toBe(false);
  });
});

describe("createUserProfile", () => {
  it("creates a valid profile with normalized goals", () => {
    const profile = must(
      createUserProfile({
        userId: USER,
        interviewTypes: ["dsa"],
        role: "backend_engineer",
        level: "senior",
        goals: "  get faster  ",
        now: NOW,
      }),
    );
    expect(profile.userId).toBe(USER);
    expect(profile.interviewTypes).toEqual(["dsa"]);
    expect(profile.role).toBe("backend_engineer");
    expect(profile.level).toBe("senior");
    expect(profile.goals).toBe("get faster");
    expect(profile.createdAt).toBe(NOW);
    expect(profile.updatedAt).toBe(NOW);
  });

  it("drops blank goals instead of storing empty strings", () => {
    const profile = must(
      createUserProfile({
        userId: USER,
        interviewTypes: ["dsa"],
        role: "other",
        level: "entry",
        goals: "   ",
        now: NOW,
      }),
    );
    expect(profile.goals).toBeUndefined();
  });

  it("rejects unknown taxonomy values", () => {
    expect(
      mustErr(
        createUserProfile({ userId: USER, interviewTypes: ["dsa"], role: "wizard", level: "mid" }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createUserProfile({ userId: USER, interviewTypes: ["dsa"], role: "other", level: "wizard" }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createUserProfile({ userId: USER, interviewTypes: ["behavioral"], role: "other", level: "mid" }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("rejects empty and duplicate interview types", () => {
    expect(
      mustErr(createUserProfile({ userId: USER, interviewTypes: [], role: "other", level: "mid" })),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createUserProfile({
          userId: USER,
          interviewTypes: ["dsa", "dsa"],
          role: "other",
          level: "mid",
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("caps goals length", () => {
    expect(
      mustErr(
        createUserProfile({
          userId: USER,
          interviewTypes: ["dsa"],
          role: "other",
          level: "mid",
          goals: "x".repeat(501),
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("updateUserProfile", () => {
  it("keeps identity + createdAt while moving the editable fields", () => {
    const original = must(
      createUserProfile({
        userId: USER,
        interviewTypes: ["dsa"],
        role: "other",
        level: "entry",
        now: NOW,
      }),
    );
    const later = new Date("2026-09-15T10:00:00.000Z");
    const updated = must(
      updateUserProfile(
        original,
        { interviewTypes: ["dsa"], role: "ml_engineer", level: "staff", goals: "systems" },
        later,
      ),
    );
    expect(updated.userId).toBe(USER);
    expect(updated.createdAt).toBe(NOW);
    expect(updated.updatedAt).toBe(later);
    expect(updated.role).toBe("ml_engineer");
    expect(updated.level).toBe("staff");
    expect(updated.goals).toBe("systems");
  });

  it("propagates validation failures", () => {
    const original = must(
      createUserProfile({
        userId: USER,
        interviewTypes: ["dsa"],
        role: "other",
        level: "entry",
        now: NOW,
      }),
    );
    expect(
      mustErr(updateUserProfile(original, { interviewTypes: [], role: "other", level: "entry" })),
    ).toBe("VALIDATION_ERROR");
  });
});
