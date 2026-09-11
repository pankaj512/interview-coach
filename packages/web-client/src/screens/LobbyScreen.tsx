// H-Lobby — pre-join summary (HLD 4.1, ux-spec §1/§2).
//
// Config recap + Join. Join is the only forward action; Back returns to
// Setup (config stale → back to Setup per spec §2).

import type { SerializedInterview } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { StatusChip } from "../ds/status.js";

export function LobbyScreen({
  interview,
  busy,
  error,
  onJoin,
  onBack,
}: {
  readonly interview: SerializedInterview;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onJoin: () => void;
  readonly onBack: () => void;
}) {
  const config = interview.configuration;
  return (
    <div className="screen screen-lobby">
      <header className="topbar topbar-pre">
        <span className="brand">Interview Coach</span>
        <span className="spacer" />
        <StatusChip connection="idle" />
      </header>
      <p className="eyebrow">Lobby · Ready to join</p>
      <h2 className="screen-title">You&apos;re up, {interview.candidateId}</h2>
      <section className="card lobby-card" aria-label="Interview summary">
        <dl className="summary">
          <div>
            <dt>Interview</dt>
            <dd>{interview.id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{interview.status}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>{config.difficulty ?? "Mixed"}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{config.durationMinutes !== undefined ? `${config.durationMinutes} min` : "Open"}</dd>
          </div>
          <div>
            <dt>Problems</dt>
            <dd>{interview.problems.length > 0 ? interview.problems.length : (config.problemCount ?? 1)}</dd>
          </div>
          {config.topicFocus !== undefined && config.topicFocus.length > 0 && (
            <div>
              <dt>Topic focus</dt>
              <dd>{config.topicFocus.join(", ")}</dd>
            </div>
          )}
        </dl>
        <p className="hint">
          Joining opens the realtime voice session — the interviewer speaks first. Use headphones.
        </p>
      </section>
      {error !== null && <p className="error">{error}</p>}
      <div className="row actions">
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onJoin} disabled={busy} autoFocus>
          {busy ? "Joining…" : "Join interview"}
        </PrimaryButton>
      </div>
    </div>
  );
}
