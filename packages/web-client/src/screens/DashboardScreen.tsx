// H-Dashboard (roadmap Phase 5): the learning control center. Shows who the
// user is preparing as, the recommended next practice (primary CTA), curriculum
// progress, and strengths/weaknesses — all from server-owned state. Recent
// interviews are deferred until the server listing endpoint (Phase 9); the
// Dashboard keeps no browser-local authority.

import type {
  Problem,
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
  readonly onStart: (recommendation: SerializedRecommendation, problem: Problem | null) => void;
  readonly onProfile: () => void;
}) {
  if (data.state === "loading") {
    return (
      <>
        <h1 className="page-title">{greeting()}</h1>
        <p className="lede" role="status">
          Loading your learning plan…
        </p>
      </>
    );
  }

  if (data.state === "error") {
    return (
      <>
        <h1 className="page-title">{greeting()}</h1>
        <Card className="empty-state">
          <p>Couldn&apos;t load your learning plan.</p>
          <p className="hint">{data.error ?? "Check your connection and try again."}</p>
          <div className="row actions">
            <GhostButton onClick={() => void data.reload()}>Retry</GhostButton>
          </div>
        </Card>
      </>
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
    <>
      <h1 className="page-title">{greeting()}</h1>
      <p className="lede">Ready for your next interview?</p>

      <Card className="preparing-card">
        <div>
          <Eyebrow>Preparing for</Eyebrow>
          <p className="preparing-role">{preparingForLabel(profile)}</p>
        </div>
        <GhostButton onClick={onProfile}>Edit goal</GhostButton>
      </Card>

      <h2 className="section-heading">Recommended next</h2>
      {view === null || recommendation === null ? (
        <Card className="empty-state">
          <p>No recommendation yet.</p>
          <div className="row actions">
            <PrimaryButton onClick={() => void data.regenerate()} disabled={data.busy}>
              {data.busy ? "Finding…" : "Get a recommendation"}
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <Card className="cta-card cta-primary recommendation-card">
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
              onClick={() => onStart(recommendation, data.problem)}
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

      <h2 className="section-heading">Curriculum progress</h2>
      <Card>
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
              {progress.completedTopics} of {progress.totalTopics} topics complete ·{" "}
              {progress.startedTopics} started · {progress.masteredTopics} mastered
              {progress.currentTopicName === null
                ? ""
                : ` · now on ${progress.currentTopicName}`}
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

      <h2 className="section-heading">Strengths &amp; focus areas</h2>
      <div className="progress-grid">
        <Card>
          <h3 className="section-title">Strengths</h3>
          {strengths.length === 0 ? (
            <p className="hint">Complete an interview to surface what you do well.</p>
          ) : (
            <ul className="plain-list">
              {strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="section-title">Focus areas</h3>
          {weaknesses.length === 0 ? (
            <p className="hint">No recurring weaknesses yet — keep practising.</p>
          ) : (
            <ul className="plain-list">
              {weaknesses.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.skills.length > 0 && (
        <>
          <h2 className="section-heading">Topic mastery</h2>
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
        </>
      )}

      <h2 className="section-heading">Recent Interviews</h2>
      <Card className="empty-state">
        <p>No interviews to show yet.</p>
        <p className="hint">Your recent sessions will appear here.</p>
      </Card>
    </>
  );
}
