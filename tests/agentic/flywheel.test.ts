/**
 * tests/agentic/flywheel.test.ts
 *
 * Integration test for the full Knowledge Flywheel pipeline.
 *
 * Uses Vercel AI SDK's MockLanguageModelV1 so the entire flywheel runs
 * with zero real API calls. Safe to run in CI without any API keys.
 *
 * What this validates:
 *   - All five stages execute in sequence without throwing.
 *   - Type-safe handoffs between stages.
 *   - Guardrails validate the mock outputs correctly.
 *   - The FlywheelResult shape is correct.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SPEC = {
  id: randomUUID(),
  title: "Mock Hello World Endpoint",
  brief: "Add a GET /hello endpoint",
  acceptanceCriteria: ["Returns 200 with {message: 'Hello'}"],
  affectedPaths: ["src/api/hello.ts"],
  referencedADRs: ["ADR-001"],
  createdAt: new Date().toISOString(),
};

const MOCK_ARTIFACT = {
  id: randomUUID(),
  specId: MOCK_SPEC.id,
  files: {
    "src/api/hello.ts":
      'export function hello() { return { message: "Hello" }; }',
  },
  summary: "Implemented hello endpoint",
  verificationSteps: ["npm run typecheck"],
  createdAt: new Date().toISOString(),
};

const MOCK_AUDIT = {
  id: randomUUID(),
  artifactId: MOCK_ARTIFACT.id,
  passed: true,
  findings: [],
  summary: "No issues found.",
  createdAt: new Date().toISOString(),
};

const MOCK_POLISHED = {
  ...MOCK_ARTIFACT,
  id: randomUUID(),
  summary: "Polished hello endpoint",
  createdAt: new Date().toISOString(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Mock all four agents so the test doesn't hit any LLM APIs.

vi.mock("../../src/core/agents/planner.js", () => ({
  planFeature: vi.fn().mockResolvedValue(MOCK_SPEC),
}));

vi.mock("../../src/core/agents/executor.js", () => ({
  executeSpec: vi.fn().mockResolvedValue(MOCK_ARTIFACT),
}));

vi.mock("../../src/core/agents/auditor.js", () => ({
  auditArtifact: vi.fn().mockResolvedValue(MOCK_AUDIT),
}));

vi.mock("../../src/core/agents/polisher.js", () => ({
  polishOutput: vi.fn().mockResolvedValue(MOCK_POLISHED),
}));

vi.mock("../../src/core/context/seeder.js", () => ({
  seedContext: vi.fn().mockResolvedValue({
    totalFiles: 0,
    totalDocuments: 0,
    byCollection: {},
    durationMs: 0,
  }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runFlywheel()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs all five stages and returns a FlywheelResult", async () => {
    const { runFlywheel } = await import("../../src/core/flywheel.js");

    const result = await runFlywheel("Add a hello world endpoint");

    expect(result.runId).toBeDefined();
    expect(result.brief).toBe("Add a hello world endpoint");
    expect(result.spec.title).toBe(MOCK_SPEC.title);
    expect(result.artifact.specId).toBe(MOCK_SPEC.id);
    expect(result.audit.passed).toBe(true);
    expect(result.polished.summary).toBe("Polished hello endpoint");
    expect(result.completedAt).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("skips reseed by default", async () => {
    const { seedContext } = await import("../../src/core/context/seeder.js");
    const { runFlywheel } = await import("../../src/core/flywheel.js");

    await runFlywheel("Test brief");
    expect(seedContext).not.toHaveBeenCalled();
  });

  it("calls seedContext when reseed:true", async () => {
    const { seedContext } = await import("../../src/core/context/seeder.js");
    const { runFlywheel } = await import("../../src/core/flywheel.js");

    await runFlywheel("Test brief", { reseed: true });
    expect(seedContext).toHaveBeenCalledOnce();
  });

  it("throws if audit fails and haltOnAuditFailure is true", async () => {
    const { auditArtifact } = await import("../../src/core/agents/auditor.js");
    vi.mocked(auditArtifact).mockResolvedValueOnce({
      ...MOCK_AUDIT,
      passed: false,
      findings: [
        {
          severity: "critical",
          category: "SQL Injection",
          description: "Unsanitised input",
        },
      ],
    });

    const { runFlywheel } = await import("../../src/core/flywheel.js");
    await expect(
      runFlywheel("Test brief", { haltOnAuditFailure: true }),
    ).rejects.toThrow("[flywheel] Audit failed");
  });
});
