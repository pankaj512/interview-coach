// H-Progress (ux-spec §27–§28): history, mastery, and what to improve next.

import { buildCurriculumProgress, buildRecommendationView, buildStrengthsWeaknesses, masteryLabel } from "../dashboard.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ProgressTrack, ScoreRow, SectionHead } from "../ds/primitives.js";
import { RecommendationHero } from "../components/RecommendationHero.js";
import type { HistoryEntry } from "../history.js";
import { buildProgress } from "../progress.js";
import type { DashboardData } from "../state/use-dashboard.js";

function TrendChart({ scores }: { readonly scores: readonly number[] }) {
  if (scores.length === 0) {
    return <p className="hint">Complete a few interviews to see your performance trend.</p>;
  }
  const w = 640, h = 220, pad = 28;
  const xFor = (i: number) => (scores.length === 1 ? w / 2 : pad + (i / (scores.length - 1)) * (w - pad * 2));
  const yFor = (s: number) => h - pad - (Math.min(10, Math.max(0, s)) / 10) * (h - pad * 2);
  const points = scores.map((s, i) => `${xFor(i).toFixed(1)},${yFor(s).toFixed(1)}`).join(" ");
  return (
    <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Overall performance trend">
      {[0, 2, 4, 6, 8, 10].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={yFor(g)} y2={yFor(g)} className="trend-grid" />
      ))}
      <polyline points={points} className="trend-line" />
      {scores.map((s, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(s)} r={4} className="trend-dot" />
      ))}
    </svg>
  );
}

export function ProgressScreen({
  entries,
  data,
  starting,
  onWeakAreas,
  onStartRecommendation,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly data: DashboardData;
  readonly starting: boolean;
  readonly onWeakAreas: () => void;
  readonly onStartRecommendation: () => void;
}) {
  const skillsReady = data.state === "ready";
  const progress = buildProgress(entries, skillsReady ? data.skills : [], skillsReady ? data.curriculum : null);
  const areas = progress.dimensions.slice().sort((a, b) => a.score - b.score);
  const curriculumProgress = skillsReady ? buildCurriculumProgress(data.curriculum, data.skills, data.progress) : null;
  const strengthsView = skillsReady ? buildStrengthsWeaknesses(data.skills, data.curriculum) : { strengths: [], weaknesses: [] };
  const recommendationView =
    skillsReady && data.recommendation !== null
      ? buildRecommendationView(data.recommendation, data.curriculum, data.problem)
      : null;

  return (
    <>
      <h1 className="page-title">Progress</h1>
      <p className="lede">Am I actually getting better? Progress, not gamification.</p>

      {data.state === "error" && (
        <Card className="empty-state">
          <p>Couldn&apos;t load your learning state.</p>
          <p className="hint">{data.error ?? "Check your connection and try again."}</p>
          <div className="row actions">
            <GhostButton onClick={() => void data.reload()}>Retry</GhostButton>
          </div>
        </Card>
      )}

      <div className="progress-grid">
        <Card>
          <SectionHead title="Overall performance" meta="Trend" />
          <TrendChart scores={progress.trend.map((t) => t.score)} />
        </Card>
        <Card>
          <SectionHead title="Areas to improve" />
          {areas.length === 0 ? (
            <p className="hint">No dimension scores yet. Finish an interview to populate this.</p>
          ) : (
            areas.slice(0, 4).map((a) => (
              <ScoreRow key={a.label} label={a.label.replace(/_/g, " ")} score={a.score} />
            ))
          )}
          <div className="row actions">
            <PrimaryButton onClick={onWeakAreas}>Practice weak areas</PrimaryButton>
          </div>
        </Card>
      </div>

      <div className="progress-grid">
        <Card>
          <SectionHead title="Curriculum progress" />
          {curriculumProgress === null ? (
            <p className="hint">Loading your curriculum…</p>
          ) : (
            <>
              <ProgressTrack percent={curriculumProgress.percent} label="Curriculum completion" />
              <p className="hint">
                {curriculumProgress.completedTopics} of {curriculumProgress.totalTopics} topics complete · {curriculumProgress.startedTopics} started · {curriculumProgress.masteredTopics} mastered
                {curriculumProgress.currentTopicName === null ? "" : ` · now on ${curriculumProgress.currentTopicName}`}
              </p>
            </>
          )}
        </Card>
        <Card>
          <SectionHead title="Strengths & focus areas" />
          {strengthsView.strengths.length === 0 && strengthsView.weaknesses.length === 0 ? (
            <p className="hint">Complete an interview to see strengths and focus areas.</p>
          ) : (
            <div className="two-col">
              <div>
                <p className="eyebrow">Strengths</p>
                <ul className="plain-list">
                  {strengthsView.strengths.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow">Focus</p>
                <ul className="plain-list">
                  {strengthsView.weaknesses.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <PrimaryButton onClick={onWeakAreas}>Practice weak areas</PrimaryButton>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="section-title">Topic mastery</h3>
        {data.state !== "ready" || data.skills.length === 0 ? (
          <p className="hint">Topic mastery will appear after your first interview.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Mastery</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {data.skills
                .slice()
                .sort((a, b) => (b.totalAttempts ?? 0) - (a.totalAttempts ?? 0))
                .map((skill) => (
                  <tr key={skill.topicId}>
                    <td>{data.curriculum?.topics.find((topic) => topic.id === skill.topicId)?.name ?? skill.topicId}</td>
                    <td>{masteryLabel(skill.masteryLevel)}</td>
                    <td className="muted">
                      {skill.successfulAttempts}/{skill.totalAttempts}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Card>

      {progress.weaknesses.length > 0 && (
        <Card>
          <h3 className="section-title">Recurring weaknesses</h3>
          <ul className="plain-list">
            {progress.weaknesses.slice(0, 8).map((w) => (
              <li key={w.label}>
                {w.label} <span className="hint">· {w.count}×</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recommendationView === null ? (
        <p className="hint">Loading your next suggested practice…</p>
      ) : (
        <RecommendationHero
          view={recommendationView}
          primaryLabel="Start recommended"
          busy={starting || data.busy}
          onPrimary={onStartRecommendation}
          onSecondary={() => void data.regenerate()}
        />
      )}
    </>
  );
}
