// @interview-coach/web - dashboard data hook.
//
// Owns: loading the server-owned learning state the Dashboard renders
// (recommendation, curriculum, skills, recommended problem). Surprising:
// no localStorage authority, and one shared in-flight load so StrictMode
// double effects never generate twice.
//
// History: Phase 5; see docs/SESSION_HANDOFF.md.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type {
  ProblemContent,
  SerializedCurriculum,
  SerializedRecommendation,
  SerializedUserCurriculumProgress,
  SerializedUserSkillState,
} from "../api/types.js";
import { formatApiError } from "./use-interview.js";

export type DashboardState = "loading" | "ready" | "error";

export interface DashboardData {
  readonly state: DashboardState;
  readonly recommendation: SerializedRecommendation | null;
  readonly problem: ProblemContent | null;
  readonly curriculum: SerializedCurriculum | null;
  readonly skills: readonly SerializedUserSkillState[];
  readonly progress: SerializedUserCurriculumProgress | null;
  readonly error: string | null;
  readonly busy: boolean;
  readonly reload: () => Promise<void>;
  readonly regenerate: () => Promise<void>;
}

export function useDashboard(backend: BackendClient, enabled = true): DashboardData {
  const [state, setState] = useState<DashboardState>("loading");
  const [recommendation, setRecommendation] = useState<SerializedRecommendation | null>(null);
  const [problem, setProblem] = useState<ProblemContent | null>(null);
  const [curriculum, setCurriculum] = useState<SerializedCurriculum | null>(null);
  const [skills, setSkills] = useState<readonly SerializedUserSkillState[]>([]);
  const [progress, setProgress] = useState<SerializedUserCurriculumProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback((): Promise<void> => {
    if (!enabled) {
      setState("loading");
      setRecommendation(null);
      setProblem(null);
      setCurriculum(null);
      setSkills([]);
      setProgress(null);
      setError(null);
      inFlightRef.current = null;
      return Promise.resolve();
    }
    const existing = inFlightRef.current;
    if (existing !== null) return existing;
    const promise = (async () => {
      setState("loading");
      setError(null);
      try {
        const [curricula, snapshot] = await Promise.all([
          backend.listCurriculum("dsa"),
          backend.getSkills(),
        ]);
        const active =
          curricula.find((item) => item.interviewType === "dsa") ?? curricula[0] ?? null;
        // The loop starts with a recommendation; generate the deterministic
        // one if the user has none yet (the backend validates + falls back).
        const current =
          (await backend.getCurrentRecommendation()) ?? (await backend.createRecommendation());
        let recommendedProblem: ProblemContent | null = null;
        try {
          recommendedProblem = await backend.getProblemContent(current.problemId);
        } catch {
          // The problem panel degrades to the topic name if the catalog row
          // is unavailable; the recommendation itself is still valid.
        }
        setCurriculum(active);
        setSkills(snapshot.skills);
        setProgress(snapshot.progress);
        setRecommendation(current);
        setProblem(recommendedProblem);
        setState("ready");
      } catch (e) {
        setError(formatApiError(e));
        setState("error");
      }
    })();
    inFlightRef.current = promise;
    void promise.finally(() => {
      inFlightRef.current = null;
    });
    return promise;
  }, [backend, enabled]);

  useEffect(() => {
    void load();
  }, [load, enabled]);

  const regenerate = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    try {
      const next = await backend.createRecommendation();
      let recommendedProblem: ProblemContent | null = null;
      try {
        recommendedProblem = await backend.getProblemContent(next.problemId);
      } catch {
        recommendedProblem = null;
      }
      setRecommendation(next);
      setProblem(recommendedProblem);
      setState("ready");
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }, [backend, enabled]);

  return {
    state,
    recommendation,
    problem,
    curriculum,
    skills,
    progress,
    error,
    busy,
    reload: load,
    regenerate,
  };
}
