// Web client - problem statement block splitter, one paragraph per block.
//
// Owns: classifying plain-text statement paragraphs as prose or judge code
// so the problem pane renders structure without a markdown dependency.
//
// History: fix/problem-statement-formatting; see docs/SESSION_HANDOFF.md.

export type StatementBlock =
  | { readonly kind: "prose"; readonly text: string }
  | { readonly kind: "code"; readonly text: string };

const CODE_LINE =
  /^\s*(\/\/|[{}]\s*$|int[\s[]|void\b|long\b|for\b|assert\b|return\b|if\b|while\b|do\b|class\b|public\b|private\b|static\b)|;/;

function isCodeLine(line: string): boolean {
  return CODE_LINE.test(line);
}

/** Split a plain-text statement on blank lines; a paragraph whose every
 *  non-empty line looks like judge code becomes one code block. */
export function splitStatement(description: string): StatementBlock[] {
  return description
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const lines = part.split("\n").filter((line) => line.trim() !== "");
      const code = lines.length > 0 && lines.every(isCodeLine);
      return code
        ? { kind: "code", text: lines.join("\n") } satisfies StatementBlock
        : { kind: "prose", text: part } satisfies StatementBlock;
    });
}
