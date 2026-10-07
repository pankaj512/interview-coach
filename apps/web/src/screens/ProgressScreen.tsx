// H-Progress (ux-spec §27): "Am I actually getting better?" Progress, not
// gamification. Trend renders in canonical /100 units; curriculum, mastery,
// strengths, and focus come straight from the server-owned builders.

import { buildCurriculumProgress, buildStrengthsWeaknesses, masteryLabel } from "../dashboard.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import type { HistoryEntry } from "../history.js";
import { buildProgress } from "../progress.js";
import type { DashboardData } from "../state/use-dashboard.js";

function TrendChart({ scores }: { readonly scores: readonly number[] }) {
  if (scores.length === 0) {
    return <p className="hint">Complete a few interviews to see your performance trend.</p>;
  }
  const w = 640, h = 120, pad = 24;
  const clamp = (s: number) => Math.min(100, Math.max(0, s));
  const xFor = (i: number) => (scores.length === 1 ? w / 2 : pad + (i / (scores.length - 1)) * (w - pad * 2));
  const yFor = (s: number) => h - pad - (clamp(s) / 100) * (h - pad * 2);
  const points = scores.map((s, i) => `${xFor(i).toFixed(1)},${yFor(s).toFixed(1)}`).join(" ");
  return (
    <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Overall performance trend">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={yFor(g)} y2={yFor(g)} className="trend-grid" />
          <text x={4} y={yFor(g) + 4} className="trend-tick">
            {g}
          </text>
        </g>
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
  const curriculumProgress = skillsReady ? buildCurriculumProgress(data.curriculum, data.skills, data.progress) : null;
  const strengthsView = skillsReady ? buildStrengthsWeaknesses(data.skills, data.curriculum) : { strengths: [], weaknesses: [] };
  const recommendBusy = starting || (skillsReady && data.busy);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Overall performance</h1>
          <p className="lede">Monotonic mastery: levels only move up, one evaluation at a time.</p>
        </div>
        <PrimaryButton onClick={onStartRecommendation} disabled={recommendBusy}>
          Recommended practice
        </PrimaryButton>
      </div>

      {data.state === "error" && (
        <Card className="empty-state">
          <p>Couldn&apos;t load your learning state.</p>
          <p className="hint">{data.error ?? "Check your connection and try again."}</p>
          <div className="row actions">
            <GhostButton onClick={() => void data.reload()}>Retry</GhostButton>
          </div>
        </Card>
      )}

      <div className="prog-grid">
        <div>
          <Card>
            <h2 className="section-title">Overall trend</h2>
            <TrendChart scores={progress.trend.map((t) => t.score)} />
          </Card>
          <Card>
            <h2 className="section-title">Curriculum progress</h2>
            {curriculumProgress === null ? (
              <p className="hint">Loading your curriculum...</p>
            ) : (
              <>
                <div className="hero-score">
                  <span className="hero-number">{curriculumProgress.percent}</span>
                  <span className="hero-den">%</span>
                </div>
                <div className="track" role="img" aria-label="Curriculum completion">
                  <div className="fill" style={{ width: `${curriculumProgress.percent}%` }} />
                </div>
                {curriculumProgress.modules.map((m) => (
                  <div className="trow" key={m.id}>
                    <span>{m.name}</span>
                    <span className="pct">
                      {m.started} / {m.total} topics
                    </span>
                  </div>
                ))}
                <p className="hint">
                  {curriculumProgress.completedTopics} of {curriculumProgress.totalTopics} topics complete
                  {curriculumProgress.currentTopicName === null ? "" : ` · now on ${curriculumProgress.currentTopicName}`}
                </p>
              </>
            )}
          </Card>
        </div>
        <div>
          <Card>
            <h2 className="section-title">Strengths</h2>
            {strengthsView.strengths.length === 0 ? (
              <p className="hint">Complete an interview to see your strengths.</p>
            ) : (
              strengthsView.strengths.slice(0, 4).map((item) => (
                <div className="item" key={item}>
                  <span className="tick" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>{item}</strong>
                  </div>
                </div>
              ))
            )}
          </Card>
          <Card>
            <h2 className="section-title">Focus areas</h2>
            {strengthsView.weaknesses.length === 0 ? (
              <p className="hint">Complete an interview to see focus areas.</p>
            ) : (
              strengthsView.weaknesses.slice(0, 4).map((item) => (
                <div className="item" key={item}>
                  <span className="tick warn" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <strong>{item}</strong>
                  </div>
                </div>
              ))
            )}
            <div className="row actions">
              <GhostButton onClick={onWeakAreas}>Practice weak areas</GhostButton>
            </div>
          </Card>
          <Card>
            <h2 className="section-title">Topic mastery</h2>
            {data.state !== "ready" || data.skills.length === 0 ? (
              <p className="hint">Topic mastery will appear after your first interview.</p>
            ) : (
              data.skills
                .slice()
                .sort((a, b) => (b.totalAttempts ?? 0) - (a.totalAttempts ?? 0))
                .map((skill) => (
                  <div className="trow" key={skill.topicId}>
                    <span>{data.curriculum?.topics.find((topic) => topic.id === skill.topicId)?.name ?? skill.topicId}</span>
                    <span className={skill.masteryLevel === "not_started" ? "pill" : "pill hot"}>{masteryLabel(skill.masteryLevel)}</span>
                    <span className="pct">
                      {skill.successfulAttempts} / {skill.totalAttempts} attempts
                    </span>
                  </div>
                ))
            )}
          </Card>
        </div>
      </div>

      <div className="cols">
        {progress.types.length > 0 && (
          <Card>
            <h2 className="section-title">Performance by type</h2>
            {progress.types.map((t) => (
              <div className="trow" key={t.label}>
                <span>{t.label}</span>
                <span className="pct">{t.score} / 100</span>
              </div>
            ))}
          </Card>
        )}

        {progress.weaknesses.length > 0 && (
        <Card>
          <h2 className="section-title">Recurring weaknesses</h2>
          {progress.weaknesses.slice(0, 8).map((w) => (
            <div className="item" key={w.label}>
              <span className="tick warn" aria-hidden="true">
                →
              </span>
              <div>
                <strong>{w.label}</strong>
                <span className="hint">
                  · {w.count}×
                </span>
              </div>
            </div>
          ))}
          </Card>
        )}
      </div>

    </>
  );
}
