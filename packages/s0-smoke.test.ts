import { describe, expect, it } from "vitest";
import { S0_SCAFFOLD } from "./s0-smoke.js";

describe("S0 scaffold", () => {
  it("strict TS toolchain smoke", () => {
    expect(S0_SCAFFOLD).toBe(true);
  });
});
