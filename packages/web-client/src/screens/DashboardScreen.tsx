// Dashboard: learning control center (feature 17b). Server-owned state
// only; markup follows prototypes/dashboard.html. All data branches
// (loading / error+retry / empty recommendation / empty skills) preserved.

import type {
  Problem,
  SerializedCurriculum,
  SerializedRecommendation,
  SerializedUserProfile,
} from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
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
      <div className="wrap">
        <p className="eyebrow">{greeting()}</p>
        <h1>Loading your learning plan…</h1>
      </div>
    );
  }

  if (data.state === "error") {
    return (
      <div className="wrap">
        <p className="eyebrow">{greeting()}</p>
        <h1>Dashboard</h1>
        <div className="card">
          <p>Couldn&apos;t load your learning plan.</p>
          <p className="hint">{data.error ?? "Check your connection and try again."}</p>
          <div className="row actions">
            <GhostButton onClick={() => void data.reload()}>Retry</GhostButton>
          </div>
        </div>
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
    <div className="wrap">
      <h1>{greeting()}</h1>
      <p className="prep">
        Preparing for {preparingForLabel(profile)} <GhostButton onClick={onProfile}>Edit goal</GhostButton>
      </p>

      {view === null || recommendation === null ? (
        <div className="card">
          <p>No recommendation yet.</p>
          <div className="cta">
            <PrimaryButton onClick={() => void data.regenerate()} disabled={data.busy}>
              {data.busy ? "Finding…" : "Get a recommendation"}
            </PrimaryButton>
          </div>
        </div>
      ) : (
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
        </div>
      )}

      <div className="card">
        <h2>Curriculum progress</h2>
        {progress.totalTopics === 0 ? (
          <p className="hint">Your curriculum is loading.</p>
        ) : (
          <>
            <div
              className="track"
              role="progressbar"
              aria-label="Curriculum completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div className="fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="mod">
              <span>
                {progress.completedTopics} of {progress.totalTopics} topics complete
              </span>
              <span className="pct">
                {progress.startedTopics} started · {progress.masteredTopics} mastered
                {progress.currentTopicName === null ? "" : ` · now on ${progress.currentTopicName}`}
              </span>
            </div>
            {progress.modules.slice(0, 6).map((module) => (
              <div key={module.id} className="mod">
                <span>{module.name}</span>
                <span className="pct">
                  {module.started} / {module.total}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="cols">
        <div className="card">
          <h2>Strengths</h2>
          {strengths.length === 0 ? (
            <p className="hint">Complete an interview to surface what you do well.</p>
          ) : (
            strengths.map((item) => (
              <div key={item} className="item">
                <span className="tick">✓</span>
                <div>
                  <strong>{item}</strong>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <h2>Focus areas</h2>
          {weaknesses.length === 0 ? (
            <p className="hint">No recurring weaknesses yet — keep practising.</p>
          ) : (
            weaknesses.map((item) => (
              <div key={item} className="item">
                <span className="tick warn">→</span>
                <div>
                  <strong>{item}</strong>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {data.skills.length > 0 && (
        <div className="card">
          <h2>Topic mastery</h2>
          <table className="mastery">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Level</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {data.skills
                .slice()
                .sort((a, b) => b.totalAttempts - a.totalAttempts)
                .slice(0, 6)
                .map((skill) => {
                  const level = masteryLabel(skill.masteryLevel);
                  const hot = skill.masteryLevel === "learning" || skill.masteryLevel === "developing";
                  return (
                    <tr key={skill.topicId}>
                      <td>
                        {data.curriculum?.topics.find((topic) => topic.id === skill.topicId)?.name ??
                          skill.topicId}
                      </td>
                      <td>
                        <span className={hot ? "pill hot" : "pill"}>{level}</span>
                      </td>
                      <td>
                        {skill.successfulAttempts}/{skill.totalAttempts}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Recent interviews</h2>
        <p className="hint">No interviews to show yet. Your recent sessions will appear here.</p>
      </div>
    </div>
  );
}
