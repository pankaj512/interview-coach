// Phase 3 curriculum + skills routes: server-owned curriculum, per-user skill
// state. In-memory repos seeded from the real JSON; no DB needed.

import { afterEach, describe, expect, it } from "vitest";
import {
  DSA_CURRICULUM_ID,
  asTopicId,
  asUserId,
  createUserCurriculumProgress,
  createUserSkillState,
} from "@interview-coach/domain";
import { buildTestBackend, seedCurriculum, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

interface SessionBody {
  user: { id: string };
  session: { token: string };
}

async function register(
  tb: TestBackend,
  email: string,
): Promise<{ token: string; userId: string }> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, displayName: "Skill User", password: "correct-horse-123" },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as SessionBody;
  return { token: body.session.token, userId: body.user.id };
}

describe("phase 3 curriculum routes", () => {
  it("serves the server-owned curriculum", async () => {
    backend = buildTestBackend();
    await seedCurriculum(backend.repos);
    const res = await backend.app.inject({ method: "GET", url: "/api/curriculum" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      curricula: { id: string; interviewType: string; modules: unknown[]; topics: unknown[] }[];
    };
    expect(body.curricula).toHaveLength(1);
    expect(body.curricula[0]?.id).toBe("dsa");
    expect(body.curricula[0]?.interviewType).toBe("dsa");
    expect(body.curricula[0]?.modules).toHaveLength(12);
    expect(body.curricula[0]?.topics).toHaveLength(59);
  });

  it("filters by interviewType and rejects unknown ones", async () => {
    backend = buildTestBackend();
    await seedCurriculum(backend.repos);
    const ok = await backend.app.inject({
      method: "GET",
      url: "/api/curriculum?interviewType=dsa",
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { curricula: unknown[] }).curricula).toHaveLength(1);

    const bad = await backend.app.inject({
      method: "GET",
      url: "/api/curriculum?interviewType=system_design",
    });
    expect(bad.statusCode).toBe(400);
  });

  it("serves a topic with its ordered problems", async () => {
    backend = buildTestBackend();
    await seedCurriculum(backend.repos);
    const res = await backend.app.inject({
      method: "GET",
      url: "/api/curriculum/topics/topic_arrays",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      curriculumId: string;
      topic: { name: string; problemIds: string[] };
      problems: { id: string }[];
    };
    expect(body.curriculumId).toBe("dsa");
    expect(body.topic.name).toBe("Arrays");
    expect(body.topic.problemIds).toHaveLength(10);
    expect(body.problems[0]?.id).toBe("prob_move-zeroes");

    const missing = await backend.app.inject({
      method: "GET",
      url: "/api/curriculum/topics/topic_nope",
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("phase 3 skills route", () => {
  it("requires a user session", async () => {
    backend = buildTestBackend();
    const anon = await backend.app.inject({ method: "GET", url: "/api/skills" });
    expect(anon.statusCode).toBe(401);
  });

  it("returns empty state, then persisted per-user skill state", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const { token, userId } = await register(tb, "skills@example.com");
    const auth = { authorization: `Bearer ${token}` };

    const empty = await tb.app.inject({ method: "GET", url: "/api/skills", headers: auth });
    expect(empty.json()).toMatchObject({ ok: true, skills: [], progress: null });

    const skill = createUserSkillState({
      userId: asUserId(userId),
      curriculumId: DSA_CURRICULUM_ID,
      topicId: asTopicId("topic_arrays"),
      masteryLevel: "developing",
      successfulAttempts: 2,
      totalAttempts: 3,
      lastOutcome: "success",
      strengths: ["two pointers"],
      weaknesses: ["complexity"],
    });
    if (!skill.ok) throw new Error(skill.error.message);
    await tb.repos.skillStates.save(skill.value);
    const progress = createUserCurriculumProgress({
      userId: asUserId(userId),
      curriculumId: DSA_CURRICULUM_ID,
      currentTopicId: asTopicId("topic_arrays"),
      completedTopicIds: [asTopicId("topic_strings")],
    });
    if (!progress.ok) throw new Error(progress.error.message);
    await tb.repos.curriculumProgress.save(progress.value);

    const res = await tb.app.inject({ method: "GET", url: "/api/skills", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      skills: { topicId: string; masteryLevel: string; strengths: string[] }[];
      progress: { currentTopicId: string; completedTopicIds: string[] };
    };
    expect(body.skills).toHaveLength(1);
    expect(body.skills[0]).toMatchObject({
      topicId: "topic_arrays",
      masteryLevel: "developing",
      strengths: ["two pointers"],
    });
    expect(body.progress.currentTopicId).toBe("topic_arrays");
    expect(body.progress.completedTopicIds).toEqual(["topic_strings"]);
  });

  it("isolates skill state per user", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const a = await register(tb, "skill-a@example.com");
    const b = await register(tb, "skill-b@example.com");
    const skill = createUserSkillState({
      userId: asUserId(a.userId),
      curriculumId: DSA_CURRICULUM_ID,
      topicId: asTopicId("topic_arrays"),
      masteryLevel: "proficient",
      successfulAttempts: 3,
      totalAttempts: 3,
    });
    if (!skill.ok) throw new Error(skill.error.message);
    await tb.repos.skillStates.save(skill.value);

    const aRead = await tb.app.inject({
      method: "GET",
      url: "/api/skills",
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect((aRead.json() as { skills: unknown[] }).skills).toHaveLength(1);
    const bRead = await tb.app.inject({
      method: "GET",
      url: "/api/skills",
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect((bRead.json() as { skills: unknown[] }).skills).toHaveLength(0);
  });
});
