// Phase 5 dashboard client tests: curriculum + skills URL shapes, unwrapping,
// and the bearer header. Fake fetch, no network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";

type Init = { method?: string; headers?: Record<string, string>; body?: string };

interface Call {
  readonly url: string;
  readonly method: string;
  readonly auth: string | undefined;
}

function recordingFetch(
  respond: (call: Call) => { status: number; body: unknown },
): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchFn = async (input: string, init?: Init) => {
    const call: Call = {
      url: input,
      method: init?.method ?? "GET",
      auth: init?.headers?.["authorization"],
    };
    calls.push(call);
    const result = respond(call);
    return { status: result.status, json: async () => result.body };
  };
  return { fetch, calls };
}

const CURRICULUM = {
  id: "dsa",
  interviewType: "dsa",
  name: "DSA",
  version: 1,
  modules: [{ id: "mod_1", curriculumId: "dsa", order: 1, name: "Foundations", topicIds: ["topic_arrays"] }],
  topics: [
    { id: "topic_arrays", curriculumId: "dsa", moduleId: "mod_1", order: 1, name: "Arrays", problemIds: ["prob_move-zeroes"] },
  ],
};

const SKILL = {
  userId: "user_1",
  curriculumId: "dsa",
  topicId: "topic_arrays",
  masteryLevel: "learning",
  successfulAttempts: 1,
  totalAttempts: 2,
  strengths: ["Communication"],
  weaknesses: ["Complexity"],
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

describe("BackendClient dashboard reads", () => {
  it("GETs the curriculum filtered by interview type", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: { ok: true, curricula: [CURRICULUM] },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    const curricula = await client.listCurriculum("dsa");
    expect(curricula).toHaveLength(1);
    expect(curricula[0]?.id).toBe("dsa");
    expect(calls[0]?.url).toBe("http://localhost:3000/api/curriculum?interviewType=dsa");
    expect(calls[0]?.auth).toBe("Bearer tok");
  });

  it("GETs the curriculum without a query when no type is given", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: { ok: true, curricula: [] },
    }));
    const client = new BackendClient("http://localhost:3000", fetch);
    await client.listCurriculum();
    expect(calls[0]?.url).toBe("http://localhost:3000/api/curriculum");
  });

  it("GETs and unwraps the skill snapshot", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: {
        ok: true,
        skills: [SKILL],
        progress: {
          userId: "user_1",
          curriculumId: "dsa",
          currentTopicId: "topic_arrays",
          completedTopicIds: [],
          createdAt: "2026-09-14T00:00:00.000Z",
          updatedAt: "2026-09-14T00:00:00.000Z",
        },
      },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    const snapshot = await client.getSkills();
    expect(snapshot.skills).toHaveLength(1);
    expect(snapshot.skills[0]?.masteryLevel).toBe("learning");
    expect(snapshot.progress?.currentTopicId).toBe("topic_arrays");
    expect(calls[0]?.url).toBe("http://localhost:3000/api/skills");
  });

  it("surfaces a 401 as BackendApiError", async () => {
    const { fetch } = recordingFetch(() => ({
      status: 401,
      body: { ok: false, error: { code: "UNAUTHORIZED", message: "Sign in", retryable: false } },
    }));
    const client = new BackendClient("http://localhost:3000", fetch);
    await expect(client.getSkills()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });
});
