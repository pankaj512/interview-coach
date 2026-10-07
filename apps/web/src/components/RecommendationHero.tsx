import type { buildRecommendationView } from "../dashboard.js";
import { recommendationSourceLabel } from "../dashboard.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";

type RecommendationHeroView = ReturnType<typeof buildRecommendationView>;

export function RecommendationHero({
  view,
  primaryLabel,
  busy,
  onPrimary,
  onSecondary,
}: {
  readonly view: RecommendationHeroView;
  readonly primaryLabel: string;
  readonly busy: boolean;
  readonly onPrimary: () => void;
  readonly onSecondary: () => void;
}) {
  return (
    <div className="rec">
      <span className="tag">{view.typeLabel}</span>
      <span className="tag">{recommendationSourceLabel(view.source)}</span>
      <h2>
        {view.topicName}
        {view.problemTitle !== null && <> · {view.problemTitle}</>}{" "}
        {view.problemDifficulty !== null && <span className="lvl">{view.problemDifficulty}</span>}
      </h2>
      {view.moduleName !== null && <p>{view.moduleName}</p>}
      <p>{view.reason}</p>
      <div className="cta">
        <PrimaryButton onClick={onPrimary} disabled={busy}>
          {busy ? "Starting..." : primaryLabel}
        </PrimaryButton>
        <GhostButton onClick={onSecondary} disabled={busy}>
          New suggestion
        </GhostButton>
      </div>
    </div>
  );
}
