// Dashboard: learning control center (Phase 5). Uses server-owned state only.

import type {
  Problem,
  SerializedCurriculum,
  SerializedRecommendation,
  SerializedUserProfile,
} from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, Eyebrow } from "../ds/primitives.js";
import {
  buildCurriculumProgress,
  buildRecommendationView,
  buildStrengthsWeaknesses,
  masteryLabel,
  preparingForLabel,
  recommendationSourceLabel,
} from "../dashboard.js";
import type { DashboardData } from "../state/use-dashboard.js";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardScreen({
  profile,
  data,
  starting,
  onStart,
  onProfile,
}: {
  readonly profile: SerializedUserProfile;
  readonly data: DashboardData;
  readonly starting: boolean;
  readonly onStart: (
    recommendation: SerializedRecommendation,
    problem: Problem | null,
    curriculum: SerializedCurriculum | null,
  ) => void;
  readonly onProfile: () => void;
}) {
  if (data.state === "loading") {
    return (
      <div className="dashboard-shell">
        <p className="eyebrow">{greeting()}</p>
        <h1>Loading your learning plan…</h1>
      </div>
    );
  }

  if (data.state === "error") {
    return (
      <div className="dashboard-shell">
        <p className="eyebrow">{greeting()}</p>
        <h1>Dashboard</h1>
        <Card className="empty-state">
          <p>Couldn&apos;t load your learning plan.</p>
          <p className="hint">{data.error ?? "Check your connection and try again."}</p>
          <div className="row actions">
            <GhostButton onClick={() => void data.reload()}>Retry</GhostButton>
          </div>
        </Card>
      </div>
    );
  }

  const progress = buildCurriculumProgress(data.curriculum, data.skills, data.progress);
  const { strengths, weaknesses } = buildStrengthsWeaknesses(data.skills, data.curriculum);
  const recommendation = data.recommendation;
  const view =
    recommendation === null
      ? null
      : buildRecommendationView(recommendation, data.curriculum, data.problem);

  return (
    <div className="dashboard-shell">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>Learning loop</h1>
          <p className="hint">Ready for your next interview?</p>
        </div>
        <div className="dashboard-actions">
          <GhostButton onClick={onProfile}>Edit goal</GhostButton>
        </div>
      </div>

      <section className="dashboard-grid">
        <Card className="preparing-card">
          <div>
            <Eyebrow>Preparing for</Eyebrow>
            <p className="preparing-role">{preparingForLabel(profile)}</p>
          </div>
          <GhostButton onClick={onProfile}>Update</GhostButton>
        </Card>

        {view === null || recommendation === null ? (
          <Card className="cta-card empty-state">
            <p>No recommendation yet.</p>
            <div className="row actions">
              <PrimaryButton onClick={() => void data.regenerate()} disabled={data.busy}>
                {data.busy ? "Finding…" : "Get a recommendation"}
              </PrimaryButton>
            </div>
          </Card>
        ) : (
          <Card className="cta-card recommendation-card">
            <div className="recommendation-head">
              <span className="badge">{view.typeLabel}</span>
              <span className="hint">{recommendationSourceLabel(view.source)}</span>
            </div>
            <h3 className="cta-title">{view.topicName}</h3>
            {view.moduleName !== null && <p className="cta-sub">{view.moduleName}</p>}
            {view.problemTitle !== null && (
              <p className="recommendation-problem">
                {view.problemTitle}
                {view.problemDifficulty !== null && (
                  <span className="badge recommendation-difficulty">{view.problemDifficulty}</span>
                )}
              </p>
            )}
            <p className="recommendation-reason">{view.reason}</p>
            <div className="row actions">
              <PrimaryButton
                onClick={() => onStart(recommendation, data.problem, data.curriculum)}
                disabled={starting || data.busy}
              >
                {starting ? "Starting…" : "Start practice"}
              </PrimaryButton>
              <GhostButton onClick={() => void data.regenerate()} disabled={starting || data.busy}>
                New suggestion
              </GhostButton>
            </div>
          </Card>
        )}

        <Card className="progress-card">
          <div className="section-head">
            <h3>Curriculum progress</h3>
            <span className="pill">{progress.percent}%</span>
          </div>
          {progress.totalTopics === 0 ? (
            <p className="hint">Your curriculum is loading.</p>
          ) : (
            <>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Curriculum completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
              >
                <span className="progress-fill" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="hint">
                {progress.completedTopics} of {progress.totalTopics} topics complete · {progress.startedTopics} started · {progress.masteredTopics} mastered
                {progress.currentTopicName === null ? "" : ` · now on ${progress.currentTopicName}`}
              </p>
              <ul className="module-list">
                {progress.modules.slice(0, 6).map((module) => (
                  <li key={module.id} className="module-row">
                    <span className="module-name">{module.name}</span>
                    <span className="module-count hint">
                      {module.started}/{module.total}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <h3 className="section-title">Strengths</h3>
          {strengths.length === 0 ? (
            <p className="hint">Complete an interview to surface what you do well.</p>
          ) : (
            <div className="chip-list">
              {strengths.map((item) => (
                <span className="chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3 className="section-title">Focus areas</h3>
          {weaknesses.length === 0 ? (
            <p className="hint">No recurring weaknesses yet — keep practising.</p>
          ) : (
            <div className="chip-list warning">
              {weaknesses.map((item) => (
                <span className="chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
          )}
        </Card>
      </section>

      {data.skills.length > 0 && (
        <section className="dashboard-table">
          <div className="section-head">
            <h3>Topic mastery</h3>
          </div>
          <Card className="table-card">
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
                  .sort((a, b) => b.totalAttempts - a.totalAttempts)
                  .slice(0, 6)
                  .map((skill) => (
                    <tr key={skill.topicId}>
                      <td>
                        {data.curriculum?.topics.find((topic) => topic.id === skill.topicId)?.name ??
                          skill.topicId}
                      </td>
                      <td>{masteryLabel(skill.masteryLevel)}</td>
                      <td className="muted">
                        {skill.successfulAttempts}/{skill.totalAttempts}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section>
        <div className="section-head">
          <h3>Recent interviews</h3>
        </div>
        <Card className="empty-state">
          <p>No interviews to show yet.</p>
          <p className="hint">Your recent sessions will appear here.</p>
        </Card>
      </section>
    </div>
  );
}
