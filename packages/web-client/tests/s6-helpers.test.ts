// S6 history helper tests.

import { describe, expect, it } from "vitest";
import { loadHistory, recordHistory, type HistoryStorage } from "../src/history.js";

function memoryStorage(seed?: string): HistoryStorage & { writes: number } {
  let value = seed ?? null;
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      writes += 1;
      value = next;
    },
  };
}

describe("history store", () => {
  it("loads empty without storage content, tolerates corrupt JSON", () => {
    expect(loadHistory(memoryStorage())).toEqual([]);
    expect(loadHistory(memoryStorage("not-json"))).toEqual([]);
  });
  it("records newest-first, dedups by id, caps at 20", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 25; i += 1) {
      recordHistory(storage, {
        id: `int_${i}`,
        candidateId: "candidate",
        status: "completed",
        at: new Date(0).toISOString(),
      });
    }
    const entries = loadHistory(storage);
    expect(entries).toHaveLength(20);
    expect(entries[0]?.id).toBe("int_24");
  });
});
