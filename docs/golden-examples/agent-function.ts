/**
 * @golden-example
 * @title Typed Agent Function Pattern
 * @nominatedBy agentic-engineer
 * @tags agent-function, ai-sdk, typescript, zod, error-handling
 *
 * This is the canonical pattern for an agent function in this codebase.
 *
 * Key conventions demonstrated:
 *  1. Function signature is strongly typed — inputs and outputs are Zod-inferred.
 *  2. Context is retrieved from the vector store before the LLM call — never cold.
 *  3. The system prompt is composed dynamically from retrieved context.
 *  4. Output is Zod-parsed immediately after generation (fail-fast at the boundary).
 *  5. Logging uses structured messages so the flywheel runner can track stages.
 *  6. The function is pure except for the LLM call and retriever — both are injected.
 */

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import type { TechSpec } from "../../docs/schema/entities.js";
import { TechSpecSchema } from "../../docs/schema/entities.js";

// ── Input / Output Schemas ────────────────────────────────────────────────────

const PlanFeatureInputSchema = z.object({
  brief: z.string().min(10).describe("Plain-English description of the feature to build."),
  contextChunks: z
    .array(z.string())
    .default([])
    .describe("Relevant context retrieved from the knowledge base."),
});

// ── Agent Function ────────────────────────────────────────────────────────────

/**
 * Generate a structured TechSpec from a plain-English feature brief.
 *
 * @param input - The brief and any pre-retrieved context chunks.
 * @returns A validated TechSpec ready for handoff to the Executor agent.
 * @throws {Error} If the LLM response cannot be parsed as a valid TechSpec.
 */
export async function planFeature(
  input: z.infer<typeof PlanFeatureInputSchema>,
): Promise<TechSpec> {
  const { brief, contextChunks } = PlanFeatureInputSchema.parse(input);

  const contextBlock =
    contextChunks.length > 0
      ? `## Relevant Context\n\n${contextChunks.map((c, i) => `### Chunk ${i + 1}\n${c}`).join("\n\n")}`
      : "No prior context available.";

  console.log(`[planner] Generating spec for: "${brief.slice(0, 60)}..."`);

  const { text } = await generateText({
    model: openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o-mini"),
    system: `You are the Product Architect for an enterprise software team.
Your job is to transform a feature brief into a precise, structured TechSpec in JSON.

${contextBlock}

Output ONLY valid JSON matching this shape — no markdown, no prose:
{
  "id": "<nanoid>",
  "title": "<concise feature title>",
  "brief": "<the original brief>",
  "acceptanceCriteria": ["<criterion 1>", ...],
  "affectedPaths": ["<file or module paths>", ...],
  "referencedADRs": ["ADR-001", ...],
  "notes": "<optional edge cases or concerns>",
  "createdAt": "<ISO-8601>"
}`,
    prompt: brief,
  });

  // ── Guardrail: parse and validate at the boundary ─────────────────────────
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      `[planner] LLM returned non-JSON for brief "${brief.slice(0, 40)}...". Raw:\n${text}`,
    );
  }

  const result = TechSpecSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[planner] TechSpec validation failed:\n${JSON.stringify(result.error.issues, null, 2)}\nRaw:\n${text}`,
    );
  }

  console.log(
    `[planner] Spec generated: "${result.data.title}" (${result.data.acceptanceCriteria.length} criteria)`,
  );
  return result.data;
}
