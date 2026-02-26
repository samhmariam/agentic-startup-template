/**
 * src/core/guardrails/schema-validator.ts
 *
 * Runtime validation for all agent I/O using the Zod schemas from docs/schema/entities.ts.
 *
 * "Type safety at agent boundaries" — every agent output is parsed through a Zod schema
 * before it propagates to the next stage of the flywheel.
 *
 * If an LLM returns a malformed response, this module throws a structured error
 * with enough detail to debug without inspecting the raw LLM output directly.
 */

import { type z, type ZodTypeAny } from "zod";
import {
  AuditReportSchema,
  CodeArtifactSchema,
  TechSpecSchema,
  type AuditReport,
  type CodeArtifact,
  type TechSpec,
} from "../../../docs/schema/entities.js";

// ── Generic validator ─────────────────────────────────────────────────────────

/**
 * Parse raw LLM text output as JSON and validate it against a Zod schema.
 *
 * @param schema - The Zod schema to validate against.
 * @param rawText - Raw text from the LLM (should be JSON).
 * @param label - Human-readable label for error messages (e.g., "TechSpec from planner").
 * @returns The validated, typed value.
 * @throws {Error} with structured details if parsing or validation fails.
 */
export function parseAgentOutput<S extends ZodTypeAny>(
  schema: S,
  rawText: string,
  label: string,
): z.output<S> {
  // Strip Markdown code fences if the LLM wrapped the JSON (defensive)
  const cleaned = rawText
    .replace(/^```(?:json|typescript|ts)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (cause) {
    throw new Error(
      `[guardrail] ${label}: LLM returned non-JSON output.\n` +
        `Raw text (first 500 chars):\n${rawText.slice(0, 500)}`,
      { cause },
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = JSON.stringify(result.error.issues, null, 2);
    throw new Error(
      `[guardrail] ${label}: Schema validation failed.\n` +
        `Issues:\n${issues}\n` +
        `Parsed value:\n${JSON.stringify(parsed, null, 2).slice(0, 800)}`,
    );
  }

  return result.data;
}

// ── Typed convenience functions ───────────────────────────────────────────────

/**
 * Validate LLM output as a TechSpec.
 * Called immediately after the Planning Agent's generateText call.
 */
export function parseTechSpec(rawText: string): TechSpec {
  return parseAgentOutput(TechSpecSchema, rawText, "TechSpec from planner");
}

/**
 * Validate LLM output as a CodeArtifact.
 * Called immediately after the Executor Agent's generateText call.
 */
export function parseCodeArtifact(rawText: string): CodeArtifact {
  return parseAgentOutput(CodeArtifactSchema, rawText, "CodeArtifact from executor");
}

/**
 * Validate LLM output as an AuditReport.
 * Called immediately after the Auditor Agent's generateText call.
 */
export function parseAuditReport(rawText: string): AuditReport {
  return parseAgentOutput(AuditReportSchema, rawText, "AuditReport from auditor");
}
