# Audit — Phase 0: Freeze the Successful MVP

- **HLD phase:** Phase 0 (Freeze the successful MVP)
- **Implemented in:** S0 (bootstrap + frozen docs), tag `session-0`
- **Source of truth:** HLD §10 Phase 0, §2/§3 (MVP findings), §5.6–5.7 (validated
  config), §14 (principles); frozen `docs/architecture-frozen.md` §1–§3
- **Scope of this audit:** the Phase-0 freeze itself — whether the baseline was
  accurately captured and remains reproducible. The freeze artifacts are the
  frozen docs (S0) plus the external CLI regression harness at
  `/home/pankaj/dev/Projects/InterviewCoachCli` (never duplicated in this repo).
  Domain/product code (S1+) is out of scope and audited in Phases 1–8.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Current CLI remains reproducibly usable.

## Checklist vs HLD

### 0.1 Baseline (document: CLI architecture, Voice Live config, audio format, VAD/AEC config, tool interface, env vars)
- [x] CLI architecture documented — CLI `README.md` §Architecture, frozen §2
      (media/control/tool planes + external harness pointer).
- [x] Voice Live config documented — endpoint `https://interview-coach-voice.services.ai.azure.com`,
      model `gpt-realtime-mini`, API `2026-04-10`, voice `en-US-Andrew:DragonHDLatestNeural`
      (frozen §3, AGENTS.md).
- [x] Audio format documented — PCM16 / 24 kHz / mono both directions
      (frozen §3; CLI `audio.ts:4-5,20-27,53-58`).
- [x] VAD config documented — `server_vad` with threshold 0.35 / speech 80 ms /
      silence 500 ms / interrupt+create (frozen §3; CLI `voice-session.ts:88-95`).
- [ ] AEC / noise-suppression config matches the harness (see F0-1).
- [x] Tool interface documented — frozen §4; CLI `tools.ts` (see F0-2).
- [x] Environment variables documented — CLI `.env.example` (server-only
      `AZURE_VOICELIVE_API_KEY`), repo `.env.example` (S0).

### 0.2 Regression test (model speaks first, introduction, natural conversation, context remembered, `get_current_problem`, duplicate tool events execute once, barge-in, interview can be ended, playback)
- [~] Harness exists and the non-hardware half is reproducible — CLI `tsc --noEmit`
      passes (see Verification). The live half (real mic/speaker/Azure) cannot be
      exercised in this session and stays a manual step (see F0-2 note + handoff).
- [x] Duplicate tool events execute once — CLI dedups by `call_id`
      (`voice-session.ts:363-367` `handledToolCallIds`), mirrored in S3 idempotency.
- [x] Barge-in path present — `speech_started → response.cancel → flush`
      (`voice-session.ts:160-188`), matches frozen §3.
- [ ] "Interview can be ended" via the model-tool path — harness has no
      `end_interview` (see F0-2).

### 0.3 Baseline metrics (first-response, normal-response, barge-in detection, cancellation, playback flush, tool latencies)
- [~] Playback-flush latency captured — frozen §3 records ~4–5 ms; the raw run
      log corroborates ~6 ms (see F0-3).
- [ ] Remaining metrics distilled into a committed artifact (see F0-3).

## Verification (run this session)

```
# CLI harness (non-hardware reproducibility):
cd /home/pankaj/dev/Projects/InterviewCoachCli && npx tsc --noEmit   # pass (exit 0)

# This repo S0 scaffold still current:
pnpm typecheck   # pass (tsc --noEmit)
pnpm build       # pass (tsc -b)
```

Result: all green. Live voice regression (0.2) not run — requires Azure Voice
Live credential + mic/speaker + headphones, which is out of scope for an
automated audit session.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| F0-1 | Major | frozen §3 (`architecture-frozen.md:27`) and AGENTS.md claim the validated config includes "server echo cancellation + Azure deep noise suppression"; the harness has both commented out — `voice-session.ts:96-104` ("Temporarily disabled for MVP debugging… raw mic without preprocessing") | 0.1, §5.7 | The freeze misstates what was validated. The frozen pointer the whole product was built on records AEC/NS as part of the working config, but the regression harness (and therefore the MVP's final state) ran raw mic with both off. S4's browser path does its own EC+NS client-side, so the "server-side AEC/NS" claim is currently true nowhere. | Reconcile in one direction: (a) re-enable AEC/NS in the harness, run a live re-validation with headphones, and keep frozen §3 as-is; or (b) amend frozen §3 + AGENTS.md to record "AEC/NS disabled in harness (raw mic), pending re-validation". Do not leave the frozen doc describing a config the harness does not run. |
| F0-2 | Minor | CLI `tools.ts:10-47` defines 3 tools (`get_current_problem`, `get_interview_state`, `get_candidate_performance`); frozen §4 and HLD §5.5 list `end_interview` among the initial tools; CLI `README.md:11` says "3 deterministic tools" | 0.2, §5.5 | The MVP harness cannot exercise "interview can be ended" through the model-tool path — the only end path is CLI `exit`/Ctrl+C (process shutdown). frozen §4's "initial tools" is the forward-looking product boundary (S1 added `end_interview`), but it reads as though the harness has it. | Clarify frozen §4 (or a note) that the harness exposes 3 tools; `end_interview` is a product tool landed in S1, not present in the Phase-0 harness. No harness change required unless a full 0.2 regression re-run is wanted. |
| F0-3 | Minor | Only the ~4–5 ms playback-flush figure is frozen (§3); the full 0.3 latency set (first/normal response, barge-in detection, cancellation, tool latency) lives only in the harness's `logs/interview.log` (415 lines, `[diag][timing]` entries), which is gitignored (`logs/` in CLI `.gitignore`) | 0.3 | Phase 0.3's deliverable — a captured baseline metric set — was never distilled into a committed artifact. The evidence is ephemeral and version-uncontrolled. | Extract the measured figures from `logs/interview.log` (e.g. server-VAD detection delta ~156–210 ms, playback flush ~6 ms) into a committed `docs/baseline-metrics.md`, reference it from frozen §3, and re-capture on the next live run. |
| F0-4 | Nit | frozen §3 records voice name but not voice `type` (`azure-standard`, CLI `config.ts:11,48-51`) or `tool_choice: "auto"` (CLI `voice-session.ts:100`) | 0.1, §5.6 | The freeze omits two fields of the exact wire `session.update` config. Voice `type` is a real behavioral toggle (`azure-standard` vs `azure-realtime-native`) in the harness. | Record `voice.type` and `tool_choice` in frozen §3 for full config fidelity (or decide they are non-frozen and note why). |
| F0-5 | Nit | frozen §3 records voice as a bare name string; the harness sends `voice: this.cfg.voice` as a `{type,name}` object (`config.ts:65`, `voice-session.ts:85`) | 0.1, §5.6 | The freeze does not capture the actual wire shape of the voice field, so a re-implementation from frozen §3 alone would not reproduce the harness exactly. | Confirm which form the validated run used; record the object shape (or the mapping) in frozen §3. Verification-only — no code change unless the object form is found to be wrong. |

## Cross-phase observations (carried forward, not Phase-0 defects)

- F0-1's AEC/NS discrepancy is a *baseline-fidelity* problem that predates every
  later phase. Phase 4 (web client) is already committed to doing echo
  cancellation + noise suppression in the browser's WebAudio path, so resolving
  F0-1 as "document raw-mic harness + client-side EC/NS" is consistent with S4.
- The CLI harness remains the frozen regression path (HLD principle 10, frozen
  §2). Any F0-1/F0-2 resolution must keep the harness runnable and the
  backend's tool/`call_id` contract CLI-compatible (AGENTS.md).

## Handoff to Phase 1 (Domain)

- F0-2 (`end_interview`) is expected to be closed by S1's `tool-service.ts`
  (initial 4 tools); confirm there that the product tool set matches frozen §4.
- F0-3 (baseline metrics) is a docs gap, not a code gap; it does not block the
  Phase 1 exit criterion but should be backfilled before any realtime regression
  re-run.
- F0-1 is the one open item that should be resolved *before* the next live
  voice validation, whichever track is chosen; carry it forward explicitly.

## Resolution (2026-09-12)

All five findings addressed (docs corrected to match the validated harness;
`end_interview` added to the harness). See the resolution report for exact
files. F0-1 was resolved by amending the docs (option (b) in the finding):
AEC/NS are documented as Voice Live capabilities that the harness leaves
disabled (raw mic) — no runtime behavior changed.
