// H-Weak-Areas (ux-spec §§28-29): recurring weak dimensions surface as one
// practice card per dimension. Every Practice button starts focused practice
// through the existing onPractice contract; the app owns the target, so cards
// never name a problem they cannot guarantee.

import type { SerializedCurriculum, SerializedUserSkillState } from "../api/types.js";
import { masteryLabel, masteryRank, findTopic } from "../dashboard.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import { dimensionLabel } from "../dimensions.js";
import type { HistoryEntry } from "../history.js";
import { buildProgress } from "../progress.js";

const MAX_CARDS = 3;

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
  const cards = [...progress.dimensions]
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_CARDS);

  const sortedSkills = skills
    .slice()
    .sort(
      (a, b) =>
        masteryRank(a.masteryLevel) - masteryRank(b.masteryLevel) ||
        (b.totalAttempts || 0) - (a.totalAttempts || 0),
    );
  const focusSkill = sortedSkills.find((skill) => skill.masteryLevel !== "mastered") ?? sortedSkills[0];
  const topWeakness = progress.weaknesses[0];
  const focusTopic = focusSkill === undefined ? null : findTopic(curriculum, focusSkill.topicId);
  const focus =
    focusTopic?.name ??
    topWeakness?.label ??
    "Problem solving";
  const reasons: string[] = [];
  if (focusSkill !== undefined) {
    reasons.push(`mastery is ${masteryLabel(focusSkill.masteryLevel).toLowerCase()}`);
    if (focusSkill.lastOutcome === "failure") reasons.push("most recent attempt failed");
    if ((focusSkill.weaknesses?.length ?? 0) > 0) reasons.push("flagged in past evaluations");
  }
  if (topWeakness !== undefined) reasons.push(`flagged ${topWeakness.count}× as a missed opportunity`);

  if (cards.length === 0) {
    return (
      <>
        <p className="eyebrow">Targeted practice</p>
        <h1 className="page-title">{focus}</h1>
        <p className="lede">
          {reasons.length > 0 ? `Your recent weakness: ${reasons.join(", ")}.` : "Practice your weakest area."}
        </p>
        <Card className="practice-card">
          <h2 className="practice-title">15-minute focused interview</h2>
          <div className="row actions">
            <PrimaryButton onClick={onPractice}>Start focused practice</PrimaryButton>
          </div>
        </Card>
        <div className="row actions">
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">Targeted practice</p>
      <h1 className="page-title">Recommended practice</h1>
      <p className="lede">
        Weak areas recur across sessions. Each card targets one dimension.
        {reasons.length > 0 && ` Your recent weakness: ${reasons.join(", ")}.`}
      </p>
      {cards.map((card) => (
        <Card key={card.label} className="practice-card">
          <div className="practice-top">
            <span className="practice-pill">
              <code>{card.label}</code> · {card.score}/5
            </span>
            <h2 className="practice-title">{dimensionLabel(card.label)}</h2>
          </div>
          <p className="practice-why">
            Averaging {card.score} / 5 across {progress.scoredCount}{" "}
            {progress.scoredCount === 1 ? "scored session" : "scored sessions"}.
          </p>
          <div className="row actions">
            <PrimaryButton onClick={onPractice}>Practice</PrimaryButton>
          </div>
        </Card>
      ))}
      <div className="row actions">
        <GhostButton onClick={onBack}>Back</GhostButton>
      </div>
    </>
  );
}
