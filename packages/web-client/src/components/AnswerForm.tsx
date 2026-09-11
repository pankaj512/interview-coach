// HLD 4.2/5.11 — manual answer capture (S5b).
//
// Voice turns are recorded by the model via record_candidate_answer; this
// form covers typed notes/approaches the candidate wants persisted
// explicitly (kind + content → POST .../responses, backend-owned).

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { ResponseKind } from "../api/types.js";
import { formatApiError } from "../state/use-interview.js";

export function AnswerForm({
  backend,
  interviewId,
  onRecorded,
}: {
  backend: BackendClient;
  interviewId: string;
  onRecorded: (detail: string) => void;
}) {
  const [kind, setKind] = useState<ResponseKind>("approach");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (content.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const { responseCount } = await backend.recordResponse(interviewId, {
        kind,
        content: content.trim(),
      });
      setSaved(responseCount);
      setContent("");
      onRecorded(`${kind} recorded (${responseCount} total)`);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Record an answer or note</h3>
      <form onSubmit={submit}>
        <div className="row">
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as ResponseKind)}>
              <option value="approach">approach</option>
              <option value="answer">answer</option>
              <option value="code">code</option>
              <option value="question">question</option>
              <option value="note">note</option>
            </select>
          </label>
        </div>
        <label>
          Content
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Outline your approach, edge cases, complexity…"
            rows={3}
            maxLength={10_000}
          />
        </label>
        <button type="submit" disabled={busy || content.trim() === ""}>
          {busy ? "Saving…" : "Save response"}
        </button>
      </form>
      {error !== null && <p className="error">{error}</p>}
      {saved !== null && error === null && <p className="hint">{saved} responses recorded.</p>}
    </section>
  );
}
