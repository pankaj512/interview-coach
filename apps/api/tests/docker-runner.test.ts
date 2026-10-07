// Feature 16: Docker runner units (stubbed spawn - no daemon needed).

import { describe, expect, it, vi } from "vitest";
import {
  asInterviewId,
  asSubmissionId,
  type CodeSubmission,
} from "@interview-coach/core";
import {
  buildRunArgs,
  DockerCodeRunner,
  type SpawnFn,
} from "../src/docker-runner.js";

type SpawnResult = { code: number | null; stdout: string; stderr: string; killed: boolean };
const OK: SpawnResult = { code: 0, stdout: "", stderr: "", killed: false };

function stub(sequence: SpawnResult[], seen: { bin: string; args: readonly string[] }[] = []): SpawnFn {
  let i = 0;
  return async (bin, args) => {
    seen.push({ bin, args });
    return sequence[Math.min(i++, sequence.length - 1)] ?? OK;
  };
}

const SUBMISSION: CodeSubmission = {
  id: asSubmissionId("sub_1"),
  interviewId: asInterviewId("iv_1"),
  language: "javascript",
  code: "function solve(a, b) { return a + b; }",
  createdAt: new Date(),
};

const CASES = [{ name: "adds", args: [2, 3], expected: 5, hidden: false }] as const;

describe("buildRunArgs", () => {
  it("locks the security boundary flags", () => {
    const args = buildRunArgs({
      image: "node:24-slim",
      name: "icr-test",
      workdir: "/tmp/scratch",
      command: ["node", "/work/harness.js", "/work/cases.json"],
      memory: "512m",
      cpus: "1.0",
      pidsLimit: 128,
    });
    expect(args).toEqual([
      "run", "-d",
      "--name", "icr-test",
      "--network=none",
      "--memory=512m",
      "--cpus=1.0",
      "--pids-limit=128",
      "--cap-drop=ALL",
      "--security-opt", "no-new-privileges",
      "--read-only",
      "--tmpfs", "/tmp:rw,exec,size=128m",
      "--user", "65534:65534",
      "-v", "/tmp/scratch:/work:ro",
      "-w", "/work",
      "-e", "HOME=/tmp",
      "-e", "TMPDIR=/tmp",
      "-e", "NODE_OPTIONS=--max-old-space-size=256",
      "node:24-slim",
      "node", "/work/harness.js", "/work/cases.json",
    ]);
  });
});

describe("DockerCodeRunner with stubbed spawn", () => {
  const runJson = JSON.stringify({
    results: [{ name: "adds", passed: true, actual: 5 }],
  });

  function okSequence(output = runJson): SpawnResult[] {
    return [
      { ...OK, stdout: '{"Id":"img"}' }, // image inspect
      { ...OK, stdout: "cid123\n" }, // run -d
      { ...OK, stdout: "0\n" }, // wait
      { ...OK, stdout: `${output}\n` }, // logs
      { ...OK }, // rm -f
    ];
  }

  it("completes a run and parses single-JSON output", async () => {
    const seen: { bin: string; args: readonly string[] }[] = [];
    const runner = new DockerCodeRunner({ spawn: stub(okSequence(), seen) });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome).toMatchObject({
      status: "completed",
      results: [{ name: "adds", passed: true, actual: 5 }],
    });
    const runCall = seen.find((c) => c.args[0] === "run");
    expect(runCall?.args).toContain("--network=none");
    expect(seen.some((c) => c.args[0] === "rm")).toBe(true);
  });

  it("maps load errors to error outcomes", async () => {
    const runner = new DockerCodeRunner({
      spawn: stub(okSequence(JSON.stringify({ loadError: "no solve" }))),
    });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome).toMatchObject({ status: "error", results: [] });
    expect(outcome.error).toContain("no solve");
  });

  it("parses C++ JSON-lines output and compile failures", async () => {
    const lines = [
      '{"name":"a","actual":5}',
      '{"name":"b","error":"boom"}',
    ].join("\n");
    const twoCases = [
      { name: "a", args: [2, 3], expected: 5, hidden: false },
      { name: "b", args: [0, 0], expected: 0, hidden: false },
    ] as const;
    const runner = new DockerCodeRunner({ spawn: stub(okSequence(lines)) });
    const outcome = await runner.execute({ ...SUBMISSION }, [...twoCases], { timeoutMs: 5000 });
    expect(outcome.status).toBe("completed");
    expect(outcome.results).toEqual([
      { name: "a", passed: true, actual: 5 },
      { name: "b", passed: false, error: "boom" },
    ]);

    const failing = new DockerCodeRunner({
      spawn: stub(okSequence("__BUILD_FAILED__\nmain.cpp:3:1: error: expected initializer")),
    });
    const failed = await failing.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(failed).toMatchObject({ status: "error", results: [] });
    expect(failed.error).toContain("compile error");
    expect(failed.error).toContain("expected initializer");
  });

  it("assembles linked C++ problems through the shape runner", async () => {
    const cppSubmission: CodeSubmission = {
      ...SUBMISSION,
      language: "cpp",
      code: "class Solution {\npublic:\n    int majorityElement(vector<int>& nums) {\n        return nums[0];\n    }\n};",
    };
    const sampleCases = [
      { name: "sample", args: [[[3, 2, 3]]], expected: 3, hidden: false },
    ] as const;
    const runner = new DockerCodeRunner({
      spawn: stub(okSequence('{"name":"sample","actual":3}')),
    });
    const outcome = await runner.execute({ ...cppSubmission }, [...sampleCases], { timeoutMs: 5000 }, {
      link: {
        runnerId: "shape-065",
        entry: "majorityElement",
        className: "Solution",
        actualRule: "pure",
      },
      examples: [{ input: "nums = [3,2,3]", output: "3" }],
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.results).toEqual([{ name: "sample", passed: true, actual: 3 }]);
  });

  it("fails linked C++ runs with missing sample inputs", async () => {
    const cppSubmission: CodeSubmission = {
      ...SUBMISSION,
      language: "cpp",
      code: "class Solution {};",
    };
    const runner = new DockerCodeRunner({ spawn: stub(okSequence()) });
    const outcome = await runner.execute(
      { ...cppSubmission },
      [...CASES],
      { timeoutMs: 5000 },
      {
        link: {
          runnerId: "shape-065",
          entry: "majorityElement",
          className: "Solution",
          actualRule: "pure",
        },
      },
    );
    expect(outcome).toMatchObject({ status: "error", results: [] });
    expect(outcome.error).toContain("missing sample input");
  });

  it("assembles linked JavaScript problems through the shape runner", async () => {
    const jsSubmission: CodeSubmission = {
      ...SUBMISSION,
      language: "javascript",
      code: "function majorityElement(nums) {\n    return nums[0];\n}",
    };
    const sampleCases = [
      { name: "sample", args: [[[3, 2, 3]]], expected: 3, hidden: false },
    ] as const;
    const runner = new DockerCodeRunner({
      spawn: stub(okSequence('{"name":"sample","actual":3}')),
    });
    const outcome = await runner.execute({ ...jsSubmission }, [...sampleCases], { timeoutMs: 5000 }, {
      link: {
        runnerId: "shape-001",
        entry: "majorityElement",
        className: "Solution",
        actualRule: "pure",
      },
      examples: [{ input: "nums = [3,2,3]", output: "3" }],
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.results).toEqual([{ name: "sample", passed: true, actual: 3 }]);
  });

  it("assembles linked Python problems through the shape runner", async () => {
    const pySubmission: CodeSubmission = {
      ...SUBMISSION,
      language: "python",
      code: "def majorityElement(nums):\n    return nums[0]\n",
    };
    const sampleCases = [
      { name: "sample", args: [[[3, 2, 3]]], expected: 3, hidden: false },
    ] as const;
    const runner = new DockerCodeRunner({
      spawn: stub(okSequence('{"name":"sample","actual":3}')),
    });
    const outcome = await runner.execute({ ...pySubmission }, [...sampleCases], { timeoutMs: 5000 }, {
      link: {
        runnerId: "shape-001",
        entry: "majorityElement",
        className: "Solution",
        actualRule: "pure",
      },
      examples: [{ input: "nums = [3,2,3]", output: "3" }],
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.results).toEqual([{ name: "sample", passed: true, actual: 3 }]);
  });

  it("kills and removes the container on timeout", async () => {
    const seen: { bin: string; args: readonly string[] }[] = [];
    const runner = new DockerCodeRunner({
      spawn: stub(
        [
          { ...OK, stdout: '{"Id":"img"}' },
          { ...OK, stdout: "cid123\n" },
          { code: null, stdout: "", stderr: "killed", killed: true },
          { ...OK },
          { ...OK },
        ],
        seen,
      ),
    });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 500 });
    expect(outcome).toMatchObject({ status: "timeout", results: [] });
    const verbs = seen.map((c) => c.args[0]);
    expect(verbs).toEqual(["image", "run", "wait", "kill", "rm"]);
  });

  it("fails closed when the daemon is unreachable", async () => {
    const down: SpawnResult = {
      code: 1,
      stdout: "",
      stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock",
      killed: false,
    };
    const runner = new DockerCodeRunner({ spawn: stub([down]) });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome).toMatchObject({ status: "error", results: [] });
    expect(outcome.error).toContain("Docker daemon unreachable");
  });

  it("rejects oversized harness output", async () => {
    const runner = new DockerCodeRunner({
      maxOutputBytes: 10,
      spawn: stub(okSequence(runJson)),
    });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome).toMatchObject({ status: "error", results: [] });
    expect(outcome.error).toContain("exceeded");
  });

  it("rejects non-JSON output", async () => {
    const runner = new DockerCodeRunner({ spawn: stub(okSequence("not json at all")) });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome).toMatchObject({ status: "error", results: [] });
  });

  it("skips debug prints interleaved with C++ verdict rows", async () => {
    const lines = [
      "debug: starting case adds",
      '{"name":"adds","actual":5}',
      "partial sums look right",
    ].join("\n");
    const runner = new DockerCodeRunner({ spawn: stub(okSequence(lines)) });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome).toMatchObject({
      status: "completed",
      results: [{ name: "adds", passed: true, actual: 5 }],
    });
  });

  it("pulls a missing image once", async () => {
    const seen: { bin: string; args: readonly string[] }[] = [];
    const runner = new DockerCodeRunner({
      spawn: stub(
        [
          { code: 1, stdout: "", stderr: "No such image", killed: false },
          { ...OK, stdout: "Pulled" },
          { ...OK, stdout: "cid\n" },
          { ...OK, stdout: "0\n" },
          { ...OK, stdout: `${runJson}\n` },
          { ...OK },
        ],
        seen,
      ),
    });
    const outcome = await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(outcome.status).toBe("completed");
    expect(seen.filter((c) => c.args[0] === "pull")).toHaveLength(1);
    // Second execution reuses the ensured image (no new pull).
    await runner.execute({ ...SUBMISSION }, [...CASES], { timeoutMs: 5000 });
    expect(seen.filter((c) => c.args[0] === "pull")).toHaveLength(1);
  });
});

describe("cpp command shape", () => {
  it("compiles then execs via the tmpfs /tmp", async () => {
    const seen: { bin: string; args: readonly string[] }[] = [];
    const runner = new DockerCodeRunner({
      spawn: stub([
        { ...OK, stdout: '{"Id":"img"}' },
        { ...OK, stdout: "cid\n" },
        { ...OK, stdout: "0\n" },
        { ...OK, stdout: `${JSON.stringify({ results: [] })}\n` },
        { ...OK },
      ], seen),
    });
    await runner.execute(
      { ...SUBMISSION, language: "cpp", code: "Value solve(Value a) { return a; }" },
      [...CASES],
      { timeoutMs: 5000 },
    );
    const runCall = seen.find((c) => c.args[0] === "run");
    expect(runCall?.args).toContain("gcc:14-bookworm");
    const shIndex = runCall?.args.indexOf("sh") ?? -1;
    expect(shIndex).toBeGreaterThan(-1);
    expect(runCall?.args[shIndex + 2]).toContain("g++ -std=c++17 -O2");
  });
});
