// @interview-coach/api - file-based prompt assembly.
// Owns: loading versioned JSON assembly manifests plus Markdown fragments
// into interpolated prompt strings. Surprising: fail-closed (any bad
// manifest, missing file, or missing variable throws a boot-safe Error).
// History: 23; see docs/SESSION_HANDOFF.md.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const promptEntrySchema = z.object({
  parts: z.array(z.string().min(1)).min(1),
  requiredVars: z.array(z.string().min(1)).default([]),
});

const manifestSchema = z.object({
  version: z.literal(1),
  prompts: z.record(z.string().min(1), promptEntrySchema),
});

export type PromptManifest = z.infer<typeof manifestSchema>;
export type PromptSet = Record<string, string>;

const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g;

function readManifest(dir: string): PromptManifest {
  const path = join(dir, "manifest.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Prompt manifest not readable: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Prompt manifest is not valid JSON: ${path}`);
  }
  const checked = manifestSchema.safeParse(parsed);
  if (!checked.success) {
    throw new Error(`Prompt manifest failed validation: ${path} (${checked.error.issues.length} issue(s))`);
  }
  return checked.data;
}

// Assembles every prompt in the manifest directory: parts concatenate in
// order, then {{variables}} fill from vars. Throws on the first problem so a
// bad prompt file fails fast at startup instead of sending a broken prompt.
export function loadPromptSet(dir: string, vars: Record<string, string>): PromptSet {
  const manifest = readManifest(dir);
  const out: PromptSet = {};
  for (const [name, entry] of Object.entries(manifest.prompts)) {
    for (const required of entry.requiredVars) {
      if (!(required in vars)) {
        throw new Error(`Prompt "${name}" needs missing variable "${required}"`);
      }
    }
    const body = entry.parts
      .map((part) => {
        const path = join(dir, part);
        try {
          return readFileSync(path, "utf8");
        } catch {
          throw new Error(`Prompt "${name}" references missing file "${part}"`);
        }
      })
      .join("\n");
    if (body.trim() === "") {
      throw new Error(`Prompt "${name}" assembled to empty output`);
    }
    out[name] = body.replace(PLACEHOLDER, (_match, varName: string) => {
      const value = vars[varName];
      if (value === undefined) {
        throw new Error(`Prompt "${name}" needs missing variable "${varName}"`);
      }
      return value;
    });
  }
  return out;
}
