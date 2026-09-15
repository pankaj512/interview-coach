// @interview-coach/web-client — Dashboard data hook (Phase 5).
//
// Loads the server-owned learning state the Dashboard renders: the current
// recommendation (generating one deterministically if none exists), the
// curriculum (for topic/module names), the per-user skill snapshot, and the
// recommended problem. No localStorage authority — the browser only presents
// backend state. A single in-flight load is shared so React StrictMode's
// double effect does not generate a recommendation twice.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type {
  Problem,
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
  readonly problem: Problem | null;
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
  const [problem, setProblem] = useState<Problem | null>(null);
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
        let recommendedProblem: Problem | null = null;
        try {
          recommendedProblem = await backend.getProblem(current.problemId);
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
      let recommendedProblem: Problem | null = null;
      try {
        recommendedProblem = await backend.getProblem(next.problemId);
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
