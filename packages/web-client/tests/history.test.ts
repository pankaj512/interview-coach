// deleteHistoryEntry + deleteAllInterviews: cancel-then-delete behind
// History per-item Delete and Settings delete-all.
import { describe, expect, it, vi } from "vitest";
import { deleteAllInterviews, deleteHistoryEntry } from "../src/history.js";
import type { InterviewStatus, SerializedInterviewSummary } from "../src/api/types.js";

function summary(id: string, status: InterviewStatus = "completed"): SerializedInterviewSummary {
  return { interview: { id, status } } as SerializedInterviewSummary;
}

function stubClient(pages: SerializedInterviewSummary[][], failOnDelete: string[] = []) {
  const cancelled: string[] = [];
  const deleted: string[] = [];
  return {
    cancelled,
    deleted,
    listInterviews: vi.fn(async () => pages.shift() ?? []),
    cancelInterview: vi.fn(async (id: string) => {
      cancelled.push(id);
      return { id } as never;
    }),
    deleteInterview: vi.fn(async (id: string) => {
      if (failOnDelete.includes(id)) throw new Error("boom");
      deleted.push(id);
      return { id, status: "ready" as const };
    }),
  };
}

describe("deleteHistoryEntry", () => {
  it("deletes a settled entry directly without cancelling", async () => {
    const client = stubClient([]);
    await deleteHistoryEntry(client, "a", "completed");
    expect(client.cancelInterview).not.toHaveBeenCalled();
    expect(client.deleted).toEqual(["a"]);
  });

  it("cancels a live entry before deleting it", async () => {
    const client = stubClient([]);
    await deleteHistoryEntry(client, "a", "in_progress");
    expect(client.cancelled).toEqual(["a"]);
    expect(client.deleted).toEqual(["a"]);
  });

  it("cancels a paused entry before deleting it", async () => {
    const client = stubClient([]);
    await deleteHistoryEntry(client, "a", "paused");
    expect(client.cancelled).toEqual(["a"]);
    expect(client.deleted).toEqual(["a"]);
  });
});

describe("deleteAllInterviews", () => {
  it("deletes every interview across pages, cancelling live ones", async () => {
    const client = stubClient([[summary("a"), summary("b", "in_progress")], [summary("c")], []]);
    await expect(deleteAllInterviews(client, 2)).resolves.toEqual({ deleted: 3, failed: false });
    expect(client.cancelled).toEqual(["b"]);
    expect(client.deleted).toEqual(["a", "b", "c"]);
    expect(client.listInterviews).toHaveBeenCalledTimes(3);
  });

  it("resolves zero failures without deleting when history is empty", async () => {
    const client = stubClient([[]]);
    await expect(deleteAllInterviews(client, 20)).resolves.toEqual({ deleted: 0, failed: false });
    expect(client.deleteInterview).not.toHaveBeenCalled();
  });

  it("skips a stuck row, deletes the rest, and reports failure", async () => {
    // "bad" fails every delete; repaging keeps returning it until skipped.
    const client = stubClient([[summary("ok"), summary("bad")], [summary("bad")], [summary("bad")]]);
    client.deleteInterview = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("boom");
      client.deleted.push(id);
      return { id, status: "ready" as const };
    });
    await expect(deleteAllInterviews(client, 2)).resolves.toEqual({ deleted: 1, failed: true });
    expect(client.deleted).toEqual(["ok"]);
  });
});
