// Pending-store tests (S4): sessionStorage rehydration helpers. Memory
// storage fake, no DOM.
import { describe, expect, it } from "vitest";
import {
  addPendingCallId,
  createMemoryStorage,
  loadPendingCallIds,
  PENDING_CALL_IDS_CAP,
  PENDING_CALL_IDS_KEY,
  removePendingCallId,
  savePendingCallIds,
} from "../src/voice/pending-store.js";

describe("pending-store", () => {
  it("round-trips call ids and dedups", () => {
    const storage = createMemoryStorage();
    savePendingCallIds(storage, ["c1", "c2", "c1"]);
    expect(loadPendingCallIds(storage)).toEqual(["c1", "c2"]);
  });

  it("prepends new ids and removes acked ones", () => {
    const storage = createMemoryStorage();
    addPendingCallId(storage, "c1");
    addPendingCallId(storage, "c2");
    expect(loadPendingCallIds(storage)).toEqual(["c2", "c1"]);
    removePendingCallId(storage, "c2");
    expect(loadPendingCallIds(storage)).toEqual(["c1"]);
  });

  it("bounds stored ids at the queue cap", () => {
    const storage = createMemoryStorage();
    const ids = Array.from({ length: PENDING_CALL_IDS_CAP + 5 }, (_, i) => `c${i}`);
    savePendingCallIds(storage, ids);
    expect(loadPendingCallIds(storage)).toHaveLength(PENDING_CALL_IDS_CAP);
  });

  it("returns empty for missing, blank, or corrupt payloads", () => {
    const storage = createMemoryStorage();
    expect(loadPendingCallIds(storage)).toEqual([]);
    storage.setItem(PENDING_CALL_IDS_KEY, "   ");
    expect(loadPendingCallIds(storage)).toEqual([]);
    storage.setItem(PENDING_CALL_IDS_KEY, "{not json");
    expect(loadPendingCallIds(storage)).toEqual([]);
    storage.setItem(PENDING_CALL_IDS_KEY, JSON.stringify({ nope: true }));
    expect(loadPendingCallIds(storage)).toEqual([]);
  });

  it("ignores blank call ids", () => {
    const storage = createMemoryStorage();
    addPendingCallId(storage, "");
    expect(loadPendingCallIds(storage)).toEqual([]);
  });

  it("survives throwing storage (private mode)", () => {
    const storage = {
      getItem: () => null as string | null,
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => undefined,
    };
    expect(() => savePendingCallIds(storage, ["c1"])).not.toThrow();
    expect(loadPendingCallIds(storage)).toEqual([]);
  });
});
