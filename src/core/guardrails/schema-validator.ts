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
 *
 * Self-correction: `parseAgentOutputWithRetry` feeds Zod validation issues back
 * to the LLM and allows up to `maxRetries` (default: 1) correction attempts
 * before throwing.
 */

import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import type { ZodTypeAny, z } from "zod";
import {
  type AuditReport,
  AuditReportSchema,
  type CodeArtifact,
  CodeArtifactSchema,
  type TechSpec,
  TechSpecSchema,
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
  // Extract JSON from Markdown code fences wherever they appear in the string (F6).
  // If the LLM prefixes the fence with prose (e.g. "Here's the JSON:\n```json..."),
  // the regex still finds the fenced content. Falls back to the raw text.
  const fenceMatch = rawText.match(/```(?:json|typescript|ts)?\n?([\s\S]*?)```/i);
  const cleaned = (fenceMatch?.[1] ?? rawText).trim();

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

// ── Self-correcting async variant ─────────────────────────────────────────────

export interface SelfCorrectionOptions {
  /** The LLM used to regenerate a corrected response. */
  model: LanguageModelV1;
  /** The system prompt that was used in the original generation call. */
  systemPrompt: string;
  /** The original user-facing prompt, so the LLM has full context when correcting. */
  originalPrompt: string;
  /** Maximum number of correction attempts (default: 1). */
  maxRetries?: number;
}

/**
 * Parse and validate LLM text output, retrying with structured Zod error
 * feedback on validation failure.
 *
 * On each failed attempt the model receives:
 *   - Its own previous (invalid) response
 *   - A bullet-list of Zod validation issues
 *   - The original task prompt for full context
 *
 * Returns the validated value as soon as a pass occurs; throws after
 * `maxRetries` exhausted.
 */
export async function parseAgentOutputWithRetry<S extends ZodTypeAny>(
  schema: S,
  rawText: string,
  label: string,
  retryOpts: SelfCorrectionOptions,
): Promise<z.output<S>> {
  const { model, systemPrompt, originalPrompt, maxRetries = 1 } = retryOpts;
  let lastText = rawText;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const fenceMatch2 = lastText.match(/```(?:json|typescript|ts)?\n?([\s\S]*?)```/i);
    const cleaned = (fenceMatch2?.[1] ?? lastText).trim();

    let parsed: unknown;
    let issuesSummary: string | undefined;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      issuesSummary =
        "Output was not valid JSON — ensure the response is a raw JSON object with no markdown.";
    }

    if (parsed !== undefined) {
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      issuesSummary = result.error.issues
        .map((i) => `  • ${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`)
        .join("\n");
    }

    if (attempt === maxRetries) {
      throw new Error(
        `[guardrail] ${label}: self-correction exhausted (${maxRetries} attempt(s)).\n` +
          `Last validation issues:\n${issuesSummary ?? "unknown"}`,
      );
    }

    console.warn(
      `[guardrail] ${label}: attempt ${attempt + 1}/${maxRetries + 1} failed — requesting self-correction...`,
    );

    const correctionPrompt =
      `Your previous response failed schema validation with these issues:\n\n${issuesSummary}\n\n` +
      `Your previous response was:\n${lastText.slice(0, 1_500)}\n\n` +
      `Original task:\n${originalPrompt}\n\n` +
      `Produce corrected, valid JSON only — no markdown fences, no explanation.`;

    const { text } = await generateText({ model, maxRetries: 3, system: systemPrompt, prompt: correctionPrompt });
    lastText = text;
  }

  // Unreachable — loop always returns or throws.
  throw new Error(`[guardrail] ${label}: unreachable`);
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

// ── Async self-correcting typed wrappers ──────────────────────────────────────

/**
 * `parseTechSpec` with LLM self-correction on validation failure.
 * Pass the model and prompts from the Planning Agent call.
 */
export async function parseTechSpecWithRetry(
  rawText: string,
  opts: SelfCorrectionOptions,
): Promise<TechSpec> {
  return parseAgentOutputWithRetry(TechSpecSchema, rawText, "TechSpec from planner", opts);
}

/**
 * `parseCodeArtifact` with LLM self-correction on validation failure.
 * Pass the model and prompts from the Executor Agent call.
 */
export async function parseCodeArtifactWithRetry(
  rawText: string,
  opts: SelfCorrectionOptions,
): Promise<CodeArtifact> {
  return parseAgentOutputWithRetry(CodeArtifactSchema, rawText, "CodeArtifact from executor", opts);
}

/**
 * `parseAuditReport` with LLM self-correction on validation failure.
 * Pass the model and prompts from the Auditor Agent call.
 */
export async function parseAuditReportWithRetry(
  rawText: string,
  opts: SelfCorrectionOptions,
): Promise<AuditReport> {
  return parseAgentOutputWithRetry(AuditReportSchema, rawText, "AuditReport from auditor", opts);
}
