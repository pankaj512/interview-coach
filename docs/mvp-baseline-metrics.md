# MVP Baseline Metrics

Recovered from the validated MVP realtime run logs (external CLI harness,
`/home/pankaj/dev/Projects/InterviewCoachCli/logs/interview.log`). The raw log
is gitignored in the harness repo; this document is the committed distillation.

- **Run date:** 2026-09-10 (session timestamps in UTC)
- **Voice Live:** endpoint `https://interview-coach-voice.services.ai.azure.com`, model `gpt-realtime-mini`, API `2026-04-10`
- **Voice:** `{ type: "azure-standard", name: "en-US-Andrew:DragonHDLatestNeural" }`
- **Audio:** PCM16 / 24 kHz / mono, both directions (`arecord`/`aplay` S16_LE 24 kHz mono)
- **Turn detection:** `server_vad` (threshold 0.35, speech_duration_ms 80, silence_duration_ms 500, interrupt_response true, create_response true)
- **Echo/noise:** server echo cancellation + Azure deep noise suppression **disabled** — raw mic (see `docs/architecture-frozen.md` §3)

Timestamps are reported two ways: wall-clock (`HH:MM:SS.mmm`) and the harness
`perf=` counter (milliseconds since process start). All figures below are
recovered verbatim from the log; nothing is extrapolated.

## Measured values

### Mic capture startup

| Event | Time (UTC) | perf |
|---|---|---|
| mic capture started (`arecord` spawn) | 13:45:26.494 | 1006.7 ms |
| first mic chunk captured (960 B = 20 ms audio) | 13:45:26.577 | 1088.4 ms |
| first mic chunk sent to Voice Live | 13:45:26.578 | 1089.5 ms |

- capture start → first chunk captured: **81.7 ms**
- capture start → first chunk sent: **82.8 ms**

### Speech detection (server VAD)

| Event | perf | note |
|---|---|---|
| first local speech onset (client-side VAD probe) | 1248.9 ms | |
| server `input_audio_buffer.speech_started` (turn 1) | 6189.7 ms | delta local→server **210.0 ms** |
| server `input_audio_buffer.speech_started` (turn 2) | 35783.4 ms | delta local→server **224.5 ms** |
| server `input_audio_buffer.speech_started` (barge-in) | 7554.5 ms | delta local→server **156.0 ms** |

### speech_stopped / response.created

| Event | perf |
|---|---|
| server `input_audio_buffer.speech_stopped` | 7175.6 ms |
| `response.created` (turn 1) | 7183.8 ms |
| server `input_audio_buffer.speech_stopped` | 11384.3 ms |
| `response.created` (turn 2) | 11408.0 ms |

- speech_stopped → response.created: **8.2 ms** and **23.7 ms** (two samples)

### First response.audio.delta (response.created → first audio)

| response.created | first `response.audio.delta` | delta |
|---|---|---|
| 11408.0 ms | 13839.6 ms | **2431.6 ms** |
| 38843.5 ms | 40608.8 ms | **1765.3 ms** |

### Audio completion

| first delta | `response.audio.done` | audio span |
|---|---|---|
| 13839.6 ms | 15289.6 ms | **1450.0 ms** |
| 40608.8 ms | 41042.7 ms | **433.9 ms** |

### Barge-in (speech_started → cancel → playback flush)

| Event | perf |
|---|---|
| server `input_audio_buffer.speech_started` received | 7554.5 ms |
| `response.cancel` sent | 7555.4 ms |
| playback flush triggered | 7555.8 ms |
| playback flush completed | 7561.3 ms |

- speech_started → response.cancel: **~0.9 ms**
- speech_started → playback flush completed: **~6.8 ms**
- response.cancel → playback flush completed: **~5.9 ms**

Session 2 (wall-clock only, no `perf`): `response.cancel` sent → playback flush
triggered consistently **~4–5 ms** (e.g. 13:58:10.973 → 13:58:10.978).

### Tool call → execution → next response

Single `get_current_problem` call, `call_id=call_x4x…`:

| Event | Time (UTC) |
|---|---|
| `response.output_item.added` (first signal) | 13:45:39.460 |
| `response.function_call_arguments.done` | 13:45:39.471 |
| `executeTool` → executing | 13:45:39.472 |
| dispatch result (ok) logged | 13:45:39.472 |
| duplicate `call_id` skipped | 13:45:39.473 |
| `response.create` ("reasoning over tool result") | 13:45:39.523 |
| next `response.created` | 13:45:40.778 |

- first signal → tool executing: **~12 ms**
- tool executing → `response.create`: **~51 ms**
- duplicate `call_id` deduplicated (idempotency): confirmed (second event skipped)

## Observations (not cleanly measurable)

- **First-response latency of the very first greeting response is unavailable.**
  `response.created` for the initial greeting fired at 7183.8 ms but was
  cancelled by a barge-in before any audio delta, so no
  response.created → first-audio-delta figure exists for that response. The two
  available samples are **~2.43 s** and **~1.77 s** (see table above), consistent
  with the HLD's "roughly 1.7 s" note.
- **"Normal response latency" has no single canonical value** — it varies with
  model generation time. The measured range across the two complete samples is
  ~1.77–2.43 s (response.created → first audio delta).
- **Tool latency end-to-end is dominated by the model continuing its in-flight
  spoken response**, not by the tool itself. The `get_current_problem` dispatch is
  a synchronous in-memory lookup (~0 ms); the model did not emit its
  tool-incorporating response until ~11.8 s later (after finishing the response
  it was already speaking). Tool dispatch/round-trip figures are sub-100 ms;
  a clean "tool → next spoken response" latency is not separable from model
  turn-taking in this log.
- The `perf=` counter is millisecond-granular; sub-millisecond deltas (e.g. the
  ~0.9 ms cancel) are approximate.

## Unavailable

- **Memory / CPU / resource usage** of the CLI harness — not logged.
- **Normal-response latency distribution** (only two complete samples recovered).
- **Server-side VAD speech→response latency on a clean, uninterrupted turn**
  (the available samples were either interrupted or tool-bearing).
- Any metrics from the productized web client — those are measured separately,
  not part of this MVP freeze.
