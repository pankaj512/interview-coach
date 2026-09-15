import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";

export function LandingScreen({
  onSignIn,
  onCreateAccount,
  onDevGuest,
  showDevGuest,
}: {
  readonly onSignIn: () => void;
  readonly onCreateAccount: () => void;
  readonly onDevGuest: () => void;
  readonly showDevGuest: boolean;
}) {
  return (
    <main className="app landing">
      <section className="hero">
        <p className="eyebrow">Interview Coach</p>
        <h1 className="page-title">Practice real DSA interviews with an AI coach.</h1>
        <p className="lede">
          Get recommendations, live voice interviews, transcripts, and structured feedback. Sign in to save your
          progress; dev preview lets you explore the UI as a guest.
        </p>
        <div className="row actions">
          <PrimaryButton onClick={onSignIn}>Sign in to start</PrimaryButton>
          <GhostButton onClick={onCreateAccount}>Create account</GhostButton>
          {showDevGuest && (
            <GhostButton onClick={onDevGuest}>Continue as guest (dev)</GhostButton>
          )}
        </div>
      </section>

      <section className="grid">
        <Card>
          <h3 className="section-title">Adaptive learning loop</h3>
          <p className="hint">Recommendation → live interview → evaluation → skill update → new recommendation.</p>
        </Card>
        <Card>
          <h3 className="section-title">Realtime voice room</h3>
          <p className="hint">AI interviewer speaks first, with problem context and your profile.</p>
        </Card>
        <Card>
          <h3 className="section-title">History &amp; progress</h3>
          <p className="hint">Server-backed transcripts, evaluations, and mastery over curriculum topics.</p>
        </Card>
      </section>
    </main>
  );
}
