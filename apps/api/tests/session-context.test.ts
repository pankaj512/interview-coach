// Phase 7 session-context: pure assembly of the learning-loop context that is
// injected into the realtime interviewer's instructions. No DB/app needed.

import { describe, expect, it } from "vitest";
import {
  DSA_CURRICULUM_ID,
  asProblemId,
  asTopicId,
  asUserId,
  createInMemoryRepositories,
  createUserProfile,
  createUserSkillState,
  type Curriculum,
  type Problem,
  type UserProfile,
  type UserSkillState,
} from "@interview-coach/core";
import {
  assembleSessionContext,
  buildProfileSummary,
  buildSkillSummary,
  findTopicForProblem,
} from "../src/session-context.js";
import { seedCurriculum, seedDataAvailable } from "./helpers.js";

const USER = asUserId("user_ctx");

async function loadCurriculum(): Promise<Curriculum> {
  const repos = createInMemoryRepositories();
  await seedCurriculum(repos);
  const all = await repos.curricula.list();
  const curriculum = all[0];
  if (curriculum === undefined) throw new Error("curriculum seed failed");
  return curriculum;
}

function profile(): UserProfile {
  const result = createUserProfile({
    userId: USER,
    interviewTypes: ["dsa"],
    role: "backend_engineer",
    level: "senior",
    goals: "Sharpen dynamic programming",
  });
  if (!result.ok) throw new Error("profile fixture invalid");
  return result.value;
}

function skillState(): UserSkillState {
  const result = createUserSkillState({
    userId: USER,
    curriculumId: DSA_CURRICULUM_ID,
    topicId: asTopicId("topic_arrays"),
    masteryLevel: "developing",
    successfulAttempts: 2,
    totalAttempts: 4,
    strengths: ["two pointers"],
    weaknesses: ["edge cases"],
  });
  if (!result.ok) throw new Error("skill fixture invalid");
  return result.value;
}

describe("phase 7 session context", () => {
  it.skipIf(!seedDataAvailable())("resolves the curriculum topic + module for a problem", async () => {
    const curriculum = await loadCurriculum();
    const problem = { id: asProblemId("prob_move-zeroes"), title: "Move Zeroes", difficulty: "Easy" } as Problem;
    const lookup = findTopicForProblem(curriculum, problem);
    expect(lookup?.topic.id).toBe("topic_arrays");
    expect(lookup?.module?.name).toBeTruthy();
  });

  it.skipIf(!seedDataAvailable())("returns null for a missing problem or curriculum", async () => {
    const curriculum = await loadCurriculum();
    expect(findTopicForProblem(curriculum, null)).toBeNull();
    expect(findTopicForProblem(null, null)).toBeNull();
  });

  it("builds a profile summary from the taxonomy labels", () => {
    expect(buildProfileSummary(profile())).toBe(
      "Preparing for Senior Backend Engineer (Data Structures & Algorithms). Stated goal: Sharpen dynamic programming",
    );
  });

  it("builds a skill summary with mastery, attempts, strengths and focus", () => {
    expect(buildSkillSummary(skillState())).toBe(
      "mastery Developing; 2/4 successful attempts; strengths: two pointers; focus areas: edge cases",
    );
    expect(buildSkillSummary(null)).toBeUndefined();
  });

  it.skipIf(!seedDataAvailable())("assembles profile + topic + objective + skill context", async () => {
    const curriculum = await loadCurriculum();
    const context = assembleSessionContext({
      profile: profile(),
      curriculum,
      skills: [skillState()],
      problem: { id: asProblemId("prob_move-zeroes"), title: "Move Zeroes", difficulty: "Easy" } as Problem,
    });
    expect(context.profileSummary).toContain("Senior Backend Engineer");
    expect(context.topicSummary).toContain("Arrays");
    expect(context.objectiveSummary).toBeTruthy();
    expect(context.skillSummary).toContain("mastery Developing");
  });

  it("degrades to an empty context when profile/curriculum/problem are absent", () => {
    expect(
      assembleSessionContext({ profile: null, curriculum: null, skills: [], problem: null }),
    ).toEqual({});
  });
});
