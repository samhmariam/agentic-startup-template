/**
 * src/core/agents/logic-critic.ts
 *
 * Logic Critic Agent — Trust Gate component.
 *
 * Verifies that a CodeArtifact faithfully implements its parent TechSpec by
 * checking acceptance criteria coverage, implementation fidelity, and the
 * accuracy of verificationSteps.
 *
 * Used by runFlywheel() when autoMerge:true.
 * Full role logic: docs/roles/logic-critic.md
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import type { CodeArtifact, TechSpec } from "../../../docs/schema/entities.js";
import { parseAgentOutputWithRetry } from "../guardrails/schema-validator.js";

// ── Schema ────────────────────────────────────────────────────────────────────

/**
 * Result of a Logic Critic review.
 * `passed` is true only when all acceptance criteria are covered and no
 * logical contradictions or silent omissions exist.
 */
export const LogicReviewSchema = z.object({
  /** true = all five evaluation dimensions passed */
  passed: z.boolean(),
  /** Specific, actionable issue strings — empty when passed:true */
  issues: z.array(z.string()).default([]),
});
export type LogicReview = z.infer<typeof LogicReviewSchema>;

// ── System prompt ─────────────────────────────────────────────────────────────

const systemPrompt = readFileSync(
  fileURLToPath(new URL("../../../docs/roles/logic-critic.md", import.meta.url)),
  "utf-8",
);

/** Shared model: re-uses the product-architect's gpt-4o for logic evaluation. */
// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
const logicCriticModel = openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o");

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a Logic Critic review of a CodeArtifact against its parent TechSpec.
 *
 * Returns `{ passed: true, issues: [] }` when the artifact fully satisfies
 * every acceptance criterion in the spec. Otherwise returns `passed: false`
 * with a list of specific, actionable issues.
 *
 * This function is used by the Trust Gate in `runFlywheel()` when
 * `autoMerge: true` is set in `FlywheelOptions`.
 *
 * @param spec     - The validated TechSpec that defines acceptance criteria.
 * @param artifact - The CodeArtifact to evaluate against the spec.
 * @returns A `LogicReview` with `passed` boolean and `issues` list.
 */
export async function runLogicReview(spec: TechSpec, artifact: CodeArtifact): Promise<LogicReview> {
  console.log(
    `\n[logic-critic] ▶ Reviewing "${spec.title}" (${spec.acceptanceCriteria.length} criteria)`,
  );

  const specJson = JSON.stringify(spec, null, 2);
  const fileNames = Object.keys(artifact.files).join(", ");
  const verificationList = artifact.verificationSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
  const fileContents = Object.entries(artifact.files)
    .map(([p, c]) => `### ${p}\n${c.slice(0, 300)}…`)
    .join("\n\n");

  const userPrompt = `Review the following CodeArtifact against its TechSpec and return a LogicReview JSON.

## TechSpec
\`\`\`json
${specJson}
\`\`\`

## CodeArtifact
Summary: ${artifact.summary}

Files: ${fileNames}

Verification Steps:
${verificationList}

File Contents (truncated to first 300 chars each):
${fileContents}

Output a JSON object: { "passed": true|false, "issues": ["…"] }. No markdown fences. No prose.`;

  const { text } = await generateText({
    model: logicCriticModel,
    system: systemPrompt,
    prompt: userPrompt,
  });

  const review = await parseAgentOutputWithRetry(LogicReviewSchema, text, "LogicReview", {
    model: logicCriticModel,
    systemPrompt,
    originalPrompt: userPrompt,
    maxRetries: 1,
  });

  if (review.passed) {
    console.log("[logic-critic] ✓ Perfect Pass — all acceptance criteria covered");
  } else {
    console.log(`[logic-critic] ✗ Failed — ${review.issues.length} issue(s):`);
    for (const issue of review.issues) {
      console.log(`  • ${issue}`);
    }
  }

  return review;
}
