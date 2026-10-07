// V1.1-2: e2e boot probe, ported out of the CI `containers` job bash.
// Boots the compose stack and asserts exactly what CI asserted inline:
// `/api/ready` becomes true, both prometheus metric names appear, web `/`
// returns 200, and the `/history` deep link returns 200. Teardown
// (`down -v`) always runs, even on probe failure.
//
// CI-like conditions are assumed (daemon + ports 3000/8080 free); when
// Docker is absent the suite skips instead of failing, mirroring the
// existing `skipIf` style. Two local-dev neutralizations, both CI no-ops:
//   - `--env-file /dev/null`: the developer `.env` carries a real
//     `AZURE_VOICE_API_KEY`, which trips the backend prod voice guard at
//     boot; CI has no `.env`, so an empty env file changes nothing there.
//   - `-p ic-e2e-probe`: isolates container/volume names from any
//     developer stack so the owned `down -v` can never wipe foreign
//     volumes (notably a pre-existing `pgdata`).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PROJECT = "ic-e2e-probe";
const BACKEND = "http://127.0.0.1:3000";
const WEB = "http://127.0.0.1:8080";

function compose(args: readonly string[]): string {
  return execFileSync(
    "docker",
    ["compose", "-p", PROJECT, "--env-file", "/dev/null", ...args],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function hasDocker(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function pollOk(url: string, attempts = 24, delayMs = 5000): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Stack still booting; retry until the budget runs out.
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`e2e: ${url} never became ready`);
}

describe.skipIf(!hasDocker())("compose boot probe", () => {
  it(
    "boots db + backend + web and serves ready, metrics, and the SPA",
    { timeout: 600_000 },
    async () => {
      compose(["up", "-d", "--build", "db", "backend", "web"]);
      try {
        await pollOk(`${BACKEND}/api/ready`);
        const ready = (await (await fetch(`${BACKEND}/api/ready`)).json()) as {
          ready?: unknown;
        };
        expect(ready.ready).toBe(true);

        const metrics = await (await fetch(`${BACKEND}/api/metrics/prometheus`)).text();
        expect(metrics).toContain("interview_coach_uptime_seconds");
        expect(metrics).toContain("interview_coach_interview_transitions_total");

        await pollOk(`${WEB}/`);
        const history = await fetch(`${WEB}/history`);
        expect(history.status).toBe(200);
      } finally {
        compose(["down", "-v"]);
      }
    },
  );
});
