// H-Weak-Areas (ux-spec §29): targeted practice from the weakest signals.

import type { SerializedCurriculum, SerializedUserSkillState } from "../api/types.js";
import { masteryLabel, masteryRank, findTopic } from "../dashboard.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ScoreRow } from "../ds/primitives.js";
import type { HistoryEntry } from "../history.js";
import { buildProgress } from "../progress.js";

export function WeakAreasScreen({
  entries,
  skills,
  curriculum,
  onPractice,
  onBack,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly skills: readonly SerializedUserSkillState[];
  readonly curriculum: SerializedCurriculum | null;
  readonly onPractice: () => void;
  readonly onBack: () => void;
}) {
  const progress = buildProgress(entries, skills, curriculum);
  const sortedSkills = skills
    .slice()
    .sort(
      (a, b) =>
        masteryRank(a.masteryLevel) - masteryRank(b.masteryLevel) ||
        (b.totalAttempts || 0) - (a.totalAttempts || 0),
    );
  const focusSkill = sortedSkills.find((skill) => skill.masteryLevel !== "mastered") ?? sortedSkills[0];
  const weakestDimension = progress.dimensions[progress.dimensions.length - 1];
  const topWeakness = progress.weaknesses[0];
  const focusTopic = focusSkill === undefined ? null : findTopic(curriculum, focusSkill.topicId);
  const focus =
    focusTopic?.name ??
    topWeakness?.label ??
    weakestDimension?.label.replace(/_/g, " ") ??
    "Problem solving";
  const reasons: string[] = [];
  if (focusSkill !== undefined) {
    reasons.push(`mastery is ${masteryLabel(focusSkill.masteryLevel).toLowerCase()}`);
    if (focusSkill.lastOutcome === "failure") reasons.push("most recent attempt failed");
    if ((focusSkill.weaknesses?.length ?? 0) > 0) reasons.push("flagged in past evaluations");
  }
  if (topWeakness !== undefined) reasons.push(`flagged ${topWeakness.count}× as a missed opportunity`);
  if (weakestDimension !== undefined) reasons.push(`lowest-scoring dimension (${weakestDimension.score}/10)`);

  return (
    <>
      <p className="eyebrow">Targeted practice</p>
      <h1 className="page-title">{focus}</h1>
      <p className="lede">
        {reasons.length > 0 ? `Your recent weakness: ${reasons.join(", ")}.` : "Practice your weakest area."}
      </p>

      <div className="two-col">
        <Card>
          <h3 className="section-title">Recommended practice</h3>
          <p className="focus-title">15-minute focused interview</p>
          <p className="eyebrow">Focus</p>
          <ul className="plain-list">
            {(progress.weaknesses.length > 0 ? progress.weaknesses.slice(0, 4).map((w) => w.label) : [focus]).map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
          <div className="row actions">
            <PrimaryButton onClick={onPractice}>Start focused practice</PrimaryButton>
          </div>
        </Card>
        <Card>
          <h3 className="section-title">Why this was suggested</h3>
          <p className="hint">
            Derived from your recorded evaluations and weaknesses. This closes the learning loop:
            interview → feedback → weak area → targeted practice → new interview.
          </p>
          {weakestDimension !== undefined && (
            <div className="weak-bars">
              {progress.dimensions.slice(-3).map((d) => (
                <ScoreRow key={d.label} label={d.label.replace(/_/g, " ")} score={d.score} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="row actions">
        <GhostButton onClick={onBack}>Back</GhostButton>
      </div>
    </>
  );
}
