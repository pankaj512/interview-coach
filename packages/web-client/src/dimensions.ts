// Spec §23 dimension labels, mapped from the backend's HLD 5.8 keys.
// The UI specification is normative, so the client presents the spec names.

const DIMENSION_LABELS: Record<string, string> = {
  understanding: "Requirement clarification",
  approach: "Problem solving",
  correctness: "Technical correctness",
  complexity: "Trade-off analysis",
  edge_cases: "Depth of knowledge",
  communication: "Communication",
  code_quality: "Code quality",
  independence: "Independence",
  system_design: "System design",
  technical_correctness: "Technical correctness",
  problem_solving: "Problem solving",
  trade_off_analysis: "Trade-off analysis",
  depth_of_knowledge: "Depth of knowledge",
  requirement_clarification: "Requirement clarification",
};

export function dimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
