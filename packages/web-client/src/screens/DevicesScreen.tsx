// H-Devices — mic/speaker gate (HLD 4.1, ux-spec §1/§2).
//
// Mic check must pass before the lobby (blocks entry): Continue stays
// disabled until a live mic stream is metering. A denied mic keeps the
// candidate on Devices with a guided fix — never advances.

import { useEffect, useRef, useState } from "react";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";

type MicState = "idle" | "requesting" | "live" | "denied" | "unsupported";

export function DevicesScreen({
  onPassed,
  onBack,
}: {
  readonly onPassed: () => void;
  readonly onBack: () => void;
}) {
  const [micState, setMicState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);

  function teardown() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (ctxRef.current !== null) {
      void ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream !== null) {
      for (const track of stream.getTracks()) track.stop();
    }
  }

  useEffect(() => teardown, []);

  async function enableMic() {
    setDetail(null);
    const media = navigator.mediaDevices;
    if (media === undefined || typeof media.getUserMedia !== "function") {
      setMicState("unsupported");
      setDetail("This browser did not expose a microphone API. Use a recent Chrome, Edge, or Firefox over HTTPS or localhost.");
      return;
    }
    setMicState("requesting");
    try {
      const stream = await media.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) {
        setMicState("live");
        return;
      }
      const ctx = new Ctor();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const sample = ((data[i] ?? 128) - 128) / 128;
          sum += sample * sample;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setMicState("live");
    } catch {
      setMicState("denied");
      setDetail("Microphone access was denied. Click the mic icon in the address bar, allow access, then try again. A working mic is required before the lobby.");
    }
  }

  async function testSpeaker() {
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      await new Promise((resolve) => setTimeout(resolve, 350));
      osc.stop();
      await ctx.close().catch(() => undefined);
      setSpeakerTested(true);
    } catch {
      setDetail("Speaker test failed — check your output device and volume.");
    }
  }

  function handleContinue() {
    teardown();
    onPassed();
  }

  const micReady = micState === "live";
  const meterPercent = Math.round(level * 100);

  return (
    <div className="screen screen-devices">
      <header className="topbar topbar-pre">
        <span className="brand">Interview Coach</span>
      </header>
      <p className="eyebrow">Setup · Step 2 of 2</p>
      <h2 className="screen-title">Check your devices</h2>
      <p className="lede">The mic gate blocks entry until your microphone is live — the interview is voice-first.</p>
      <section className="card device-card" aria-label="Microphone check">
        <h3>
          <span aria-hidden="true">{micReady ? "●" : "○"}</span> Microphone —{" "}
          {micState === "live" ? "live" : micState === "requesting" ? "requesting…" : micState === "denied" ? "blocked" : micState === "unsupported" ? "unsupported" : "not enabled"}
        </h3>
        <div className="meter" role="meter" aria-label="Microphone level" aria-valuenow={meterPercent} aria-valuemin={0} aria-valuemax={100}>
          <div className="meter-fill" style={{ width: `${meterPercent}%` }} />
        </div>
        <p className="hint">{micReady ? "Mic level responds — speak to see it move." : "Enable the mic, then speak: the level bar should move."}</p>
        <div className="row">
          <button type="button" className="btn-ghost" onClick={enableMic} disabled={micState === "requesting" || micReady}>
            {micState === "requesting" ? "Requesting…" : micReady ? "Mic live" : "Enable microphone"}
          </button>
        </div>
        {detail !== null && <p className={micState === "denied" || micState === "unsupported" ? "error" : "hint"}>{detail}</p>}
      </section>
      <section className="card device-card" aria-label="Speaker check">
        <h3>
          <span aria-hidden="true">{speakerTested ? "●" : "○"}</span> Speaker — {speakerTested ? "tested" : "untested (optional)"}
        </h3>
        <p className="hint">Play a short test tone to confirm you can hear the interviewer.</p>
        <div className="row">
          <button type="button" className="btn-ghost" onClick={testSpeaker}>
            Play test tone
          </button>
        </div>
      </section>
      <div className="row actions">
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={handleContinue} disabled={!micReady} autoFocus={micReady}>
          Continue to lobby
        </PrimaryButton>
      </div>
      {!micReady && <p className="hint">Continue stays blocked until the mic passes.</p>}
    </div>
  );
}
