/**
 * tests/unit/schema-validator.test.ts
 *
 * Unit tests for the guardrails schema validator.
 * Fast, deterministic — no API calls.
 */

import { describe, it, expect } from "vitest";
import {
  parseTechSpec,
  parseCodeArtifact,
  parseAuditReport,
  parseAgentOutput,
} from "../../src/core/guardrails/schema-validator.js";
import { z } from "zod";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_TECH_SPEC = {
  id: "spec-001",
  title: "Hello World Endpoint",
  brief: "Add a GET /hello endpoint that returns a greeting.",
  acceptanceCriteria: [
    "GET /hello returns 200 with { message: 'Hello, world!' }",
    "Response has Content-Type: application/json",
  ],
  affectedPaths: ["src/api/hello.ts"],
  referencedADRs: ["ADR-001"],
  createdAt: "2026-02-26T00:00:00.000Z",
};

const VALID_CODE_ARTIFACT = {
  id: "artifact-001",
  specId: "spec-001",
  files: {
    "src/api/hello.ts": 'export function hello() { return { message: "Hello, world!" }; }',
  },
  summary: "Implemented hello endpoint",
  verificationSteps: ["npm run typecheck"],
  createdAt: "2026-02-26T00:00:00.000Z",
};

const VALID_AUDIT_REPORT = {
  id: "audit-001",
  artifactId: "artifact-001",
  passed: true,
  findings: [],
  summary: "No security issues found.",
  createdAt: "2026-02-26T00:00:00.000Z",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("parseTechSpec()", () => {
  it("parses valid JSON into a TechSpec", () => {
    const spec = parseTechSpec(JSON.stringify(VALID_TECH_SPEC));
    expect(spec.id).toBe("spec-001");
    expect(spec.acceptanceCriteria).toHaveLength(2);
  });

  it("strips markdown code fences before parsing", () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(VALID_TECH_SPEC)}\n\`\`\``;
    const spec = parseTechSpec(wrapped);
    expect(spec.title).toBe("Hello World Endpoint");
  });

  it("throws on non-JSON input", () => {
    expect(() => parseTechSpec("This is not JSON")).toThrow("[guardrail]");
  });

  it("throws on JSON missing required fields", () => {
    const bad = JSON.stringify({ id: "x", title: "no brief" });
    expect(() => parseTechSpec(bad)).toThrow("[guardrail]");
  });
});

describe("parseCodeArtifact()", () => {
  it("parses a valid CodeArtifact", () => {
    const artifact = parseCodeArtifact(JSON.stringify(VALID_CODE_ARTIFACT));
    expect(artifact.specId).toBe("spec-001");
    expect(Object.keys(artifact.files)).toContain("src/api/hello.ts");
  });

  it("throws on empty files object that is still valid", () => {
    // files: {} is valid by schema (no min constraint)
    const artifact = parseCodeArtifact(
      JSON.stringify({ ...VALID_CODE_ARTIFACT, files: {} }),
    );
    expect(artifact.files).toEqual({});
  });
});

describe("parseAuditReport()", () => {
  it("parses a passing report", () => {
    const report = parseAuditReport(JSON.stringify(VALID_AUDIT_REPORT));
    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("parses a failing report with findings", () => {
    const failing = {
      ...VALID_AUDIT_REPORT,
      passed: false,
      findings: [
        {
          severity: "high",
          category: "SQL Injection",
          description: "Unsanitised user input in SQL query",
          location: "src/db.ts:42",
          suggestion: "Use parameterised queries",
        },
      ],
    };
    const report = parseAuditReport(JSON.stringify(failing));
    expect(report.passed).toBe(false);
    expect(report.findings[0]?.severity).toBe("high");
  });
});

describe("parseAgentOutput() generic", () => {
  it("parses any Zod schema", () => {
    const Schema = z.object({ name: z.string(), age: z.number() });
    const result = parseAgentOutput(Schema, '{"name":"Alice","age":30}', "test");
    expect(result.name).toBe("Alice");
  });

  it("throws with label in message on schema mismatch", () => {
    const Schema = z.object({ required: z.string() });
    expect(() => parseAgentOutput(Schema, "{}", "MyAgent")).toThrow("MyAgent");
  });
});
