/**
 * src/core/agents/planner.ts
 *
 * Planning Agent — Stage 2 of the Knowledge Flywheel.
 * Owner: Product Architect role.
 *
 * Turns a plain-English feature brief into a validated TechSpec by first
 * retrieving relevant ADRs, schema context, and past plans from ChromaDB.
 */

import { generateText } from "ai";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { productArchitect } from "../../../.agentic/roles/product-architect.js";
import { plannerTools } from "../../../.agentic/tools/index.js";
import type { TechSpec } from "../../../docs/schema/entities.js";
import { formatAsContext, retrieveMulti } from "../context/retriever.js";
import { parseTechSpecWithRetry } from "../guardrails/schema-validator.js";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a structured TechSpec from a plain-English feature brief.
 *
 * Retrieves relevant context from the knowledge base before planning so the
 * spec honours existing ADRs and schema conventions.
 *
 * @param brief - Plain-English description of the feature to build.
 * @returns A Zod-validated TechSpec ready for handoff to the Executor.
 */
export async function planFeature(brief: string): Promise<TechSpec> {
  console.log(`\n[planner] ▶ Planning: "${brief.slice(0, 70)}..."`);

  // ── Stage 2a: Retrieve context ─────────────────────────────────────────────
  const contextDocs = await retrieveMulti(brief, [COLLECTIONS.PLANS, COLLECTIONS.SCHEMA], 4);
  const contextBlock = formatAsContext(contextDocs, "Prior Decisions & Schema Context");

  console.log(`[planner] Retrieved ${contextDocs.length} context chunks`);

  // ── Stage 2b: Generate spec ────────────────────────────────────────────────
  const systemPrompt = `${productArchitect.systemPrompt}\n\n${contextBlock}`;
  const userPrompt = `Generate a TechSpec for the following feature brief:\n\n${brief}`;

  const { text } = await generateText({
    model: productArchitect.model,
    ...(productArchitect.maxSteps !== undefined ? { maxSteps: productArchitect.maxSteps } : {}),
    tools: plannerTools,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // ── Stage 2c: Validate at boundary (with self-correction) ─────────────────
  const spec = await parseTechSpecWithRetry(text, {
    model: productArchitect.model,
    systemPrompt,
    originalPrompt: userPrompt,
  });
  console.log(`[planner] ✓ Spec: "${spec.title}" (${spec.acceptanceCriteria.length} criteria)`);

  return spec;
}
