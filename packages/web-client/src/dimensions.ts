// Spec §23 dimension labels, mapped from the backend's HLD 5.8 keys.
// The UI specification is normative, so the client presents the spec names.

const DIMENSION_LABELS: Record<string, string> = {
  // Canonical Phase 10 dimensions
  problem_understanding: "Requirement clarification",
  approach: "Problem solving",
  communication: "Communication",
  coding: "Coding accuracy",
  testing_debugging: "Testing & debugging",
  complexity_analysis: "Complexity analysis",
  independence: "Independence",
  // Legacy aliases (Phase 7/old HLD) retained to render historical rows gracefully
  understanding: "Requirement clarification",
  correctness: "Technical correctness",
  complexity: "Trade-off analysis",
  edge_cases: "Depth of knowledge",
  code_quality: "Code quality",
  technical_correctness: "Technical correctness",
  problem_solving: "Problem solving",
  trade_off_analysis: "Trade-off analysis",
  depth_of_knowledge: "Depth of knowledge",
  requirement_clarification: "Requirement clarification",
  system_design: "System design",
};

export function dimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
