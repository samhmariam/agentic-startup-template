/**
 * scripts/evals/agent-output.eval.ts
 *
 * LLM-as-judge evaluation for the Planning Agent.
 *
 * Runs planFeature() against fixture briefs and scores the TechSpec quality
 * using a second, independent model call as judge.
 *
 * Scoring dimensions (0–1 each):
 *   - Completeness: does the spec address all aspects of the brief?
 *   - Clarity: are acceptance criteria testable and unambiguous?
 *   - Feasibility: are the affectedPaths and steps plausible?
 *   - Safety: are security and edge cases mentioned where relevant?
 *
 * Each dimension score is averaged; result must exceed MIN_EVAL_SCORE.
 */

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { TechSpec } from "../../docs/schema/entities.js";
import { planFeature } from "../../src/core/agents/planner.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EVAL_BRIEFS = [
  "Add a POST /users endpoint that creates a new user with email, password, and optional display name. The password must be hashed. Return 201 with the created user object (no password) on success.",
  "Build a rate-limiting middleware that caps each IP address at 100 requests per minute. Use an in-memory store. Return 429 Too Many Requests when the limit is exceeded.",
];

// ── Judge ─────────────────────────────────────────────────────────────────────

interface JudgeScore {
  completeness: number;
  clarity: number;
  feasibility: number;
  safety: number;
  overall: number;
  rationale: string;
}

async function judgeSpec(brief: string, spec: TechSpec): Promise<JudgeScore> {
  const judgeModel = openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o-mini");

  const { text } = await generateText({
    model: judgeModel,
    prompt: `You are a senior staff engineer evaluating a TechSpec against a feature brief.

Brief: ${brief}

TechSpec:
${JSON.stringify(spec, null, 2)}

Score the spec on four dimensions from 0.0 to 1.0:
- completeness: does it address all aspects of the brief?
- clarity: are acceptance criteria testable and unambiguous?
- feasibility: are affected paths and steps plausible for a TypeScript codebase?
- safety: are security/edge cases mentioned where relevant?

Return ONLY valid JSON: {"completeness":0.9,"clarity":0.8,"feasibility":0.9,"safety":0.7,"rationale":"..."}`,
  });

  const cleaned = text
    .trim()
    .replace(/^```json\n?/i, "")
    .replace(/\n?```$/i, "");
  const raw = JSON.parse(cleaned) as JudgeScore;

  return {
    completeness: raw.completeness,
    clarity: raw.clarity,
    feasibility: raw.feasibility,
    safety: raw.safety,
    overall: (raw.completeness + raw.clarity + raw.feasibility + raw.safety) / 4,
    rationale: raw.rationale,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface AgentOutputEvalResult {
  brief: string;
  specTitle: string;
  scores: JudgeScore;
}

export async function runAgentOutputEvals(): Promise<AgentOutputEvalResult[]> {
  const results: AgentOutputEvalResult[] = [];

  for (const brief of EVAL_BRIEFS) {
    const spec = await planFeature(brief);
    const scores = await judgeSpec(brief, spec);
    results.push({ brief, specTitle: spec.title, scores });
  }

  return results;
}
