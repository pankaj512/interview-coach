// Phase 4 recommendation client tests: URL shapes, unwrapping, and bearer
// header. Fake fetch, no network.
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

const RECOMMENDATION = {
  id: "rec_1",
  userId: "user_1",
  curriculumId: "dsa",
  recommendationType: "new_topic",
  topicId: "topic_arrays",
  problemId: "prob_two-sum",
  reason: "Start with arrays.",
  source: "fallback",
  status: "active",
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

describe("BackendClient recommendation", () => {
  it("GETs the current recommendation (null before one exists) with the bearer", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: { ok: true, recommendation: null },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    expect(await client.getCurrentRecommendation()).toBeNull();
    expect(calls[0]?.url).toBe("http://localhost:3000/api/recommendations/current");
    expect(calls[0]?.auth).toBe("Bearer tok");
  });

  it("POSTs to generate and unwraps the recommendation", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 201,
      body: { ok: true, recommendation: RECOMMENDATION, source: "fallback" },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    const created = await client.createRecommendation();
    expect(created).toMatchObject({ id: "rec_1", problemId: "prob_two-sum" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("http://localhost:3000/api/recommendations");
  });

  it("POSTs accept with the encoded id", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: { ok: true, recommendation: { ...RECOMMENDATION, status: "accepted" } },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    const accepted = await client.acceptRecommendation("rec_1");
    expect(accepted.status).toBe("accepted");
    expect(calls[0]?.url).toBe("http://localhost:3000/api/recommendations/rec_1/accept");
  });

  it("surfaces 401 as BackendApiError", async () => {
    const { fetch } = recordingFetch(() => ({
      status: 401,
      body: { ok: false, error: { code: "UNAUTHORIZED", message: "Sign in", retryable: false } },
    }));
    const client = new BackendClient("http://localhost:3000", fetch);
    await expect(client.getCurrentRecommendation()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });
});
