// Editor-language preference tests: closed-set validation only. No DOM,
// no network — localStorage is stubbed through the global.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_LANGUAGE,
  EDITOR_LANGUAGES,
  loadEditorLanguage,
  saveEditorLanguage,
} from "../src/components/editor-prefs.js";

function stubStorage(initial: Record<string, string> = {}): Record<string, string> {
  const data: Record<string, string> = { ...initial };
  const getItem = vi.fn((key: string) => (key in data ? (data[key] as string) : null));
  const setItem = vi.fn((key: string, value: string) => {
    data[key] = value;
  });
  const removeItem = vi.fn((key: string, value: string) => {
    delete data[key];
  });
  vi.stubGlobal("localStorage", { getItem, setItem, removeItem });
  return data;
}

describe("editor language preference", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the closed CodeLanguage set with Python as the default", () => {
    expect(EDITOR_LANGUAGES).toEqual(["javascript", "python", "cpp"]);
    expect(DEFAULT_EDITOR_LANGUAGE).toBe("python");
    expect(EDITOR_LANGUAGES).toContain(DEFAULT_EDITOR_LANGUAGE);
  });

  it("returns null when nothing is stored", () => {
    stubStorage();
    expect(loadEditorLanguage()).toBeNull();
  });

  it("returns a stored language from the closed set", () => {
    stubStorage({ "ic.editor-language": "cpp" });
    expect(loadEditorLanguage()).toBe("cpp");
  });

  it("rejects unknown or empty stored values", () => {
    stubStorage({ "ic.editor-language": "rust" });
    expect(loadEditorLanguage()).toBeNull();
    stubStorage({ "ic.editor-language": "  " });
    expect(loadEditorLanguage()).toBeNull();
  });

  it("round-trips a valid language", () => {
    const data = stubStorage();
    saveEditorLanguage("javascript");
    expect(data["ic.editor-language"]).toBe("javascript");
    expect(loadEditorLanguage()).toBe("javascript");
  });

  it("ignores saves outside the closed set", () => {
    const data = stubStorage();
    saveEditorLanguage("rust" as never);
    expect("ic.editor-language" in data).toBe(false);
  });
});
