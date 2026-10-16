// Feature 23: prompt file infrastructure - manifest assembly, variable
// interpolation, and fail-closed validation errors.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadPromptSet } from "../src/prompts/loader.js";

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "prompts-"));
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const MANIFEST = JSON.stringify({
  version: 1,
  prompts: {
    judge: { parts: ["base.md", "rules.md"], requiredVars: ["role"] },
  },
});

describe("loadPromptSet", () => {
  it("assembles parts in order with interpolation", () => {
    const dir = fixture({
      "manifest.json": MANIFEST,
      "base.md": "You are a {{role}}.",
      "rules.md": "Reply with JSON.",
    });
    try {
      expect(loadPromptSet(dir, { role: "judge" })).toEqual({
        judge: "You are a judge.\nReply with JSON.",
      });
    } finally {
      cleanup(dir);
    }
  });

  it("rejects an unknown manifest version", () => {
    const dir = fixture({
      "manifest.json": JSON.stringify({ version: 2, prompts: {} }),
    });
    try {
      expect(() => loadPromptSet(dir, {})).toThrow(/manifest.*validation/);
    } finally {
      cleanup(dir);
    }
  });

  it("rejects malformed manifest JSON", () => {
    const dir = fixture({ "manifest.json": "{oops" });
    try {
      expect(() => loadPromptSet(dir, {})).toThrow(/not valid JSON/);
    } finally {
      cleanup(dir);
    }
  });

  it("names the missing fragment file", () => {
    const dir = fixture({
      "manifest.json": MANIFEST,
      "base.md": "You are a {{role}}.",
    });
    try {
      expect(() => loadPromptSet(dir, { role: "judge" })).toThrow(/rules\.md/);
    } finally {
      cleanup(dir);
    }
  });

  it("names a missing required variable", () => {
    const dir = fixture({
      "manifest.json": MANIFEST,
      "base.md": "You are a {{role}}.",
      "rules.md": "Reply with JSON.",
    });
    try {
      expect(() => loadPromptSet(dir, {})).toThrow(/"role"/);
    } finally {
      cleanup(dir);
    }
  });

  it("names an unlisted placeholder left without a value", () => {
    const dir = fixture({
      "manifest.json": JSON.stringify({
        version: 1,
        prompts: { loose: { parts: ["a.md"] } },
      }),
      "a.md": "Hello {{name}}.",
    });
    try {
      expect(() => loadPromptSet(dir, {})).toThrow(/"name"/);
    } finally {
      cleanup(dir);
    }
  });

  it("rejects empty assembled output", () => {
    const dir = fixture({
      "manifest.json": JSON.stringify({
        version: 1,
        prompts: { blank: { parts: ["a.md"] } },
      }),
      "a.md": "   \n",
    });
    try {
      expect(() => loadPromptSet(dir, {})).toThrow(/empty output/);
    } finally {
      cleanup(dir);
    }
  });
});
