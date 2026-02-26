/**
 * src/core/agents/executor.ts
 *
 * Executor Agent — Stage 3 of the Knowledge Flywheel.
 * Owner: Agentic Engineer role.
 *
 * Implements a TechSpec into a CodeArtifact using a multi-step agentic loop.
 * The agent can read files, search for examples, and self-verify with runTypeCheck/runLint.
 */

import { generateText } from "ai";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { agenticEngineer } from "../../../.agentic/roles/agentic-engineer.js";
import { executorTools } from "../../../.agentic/tools/index.js";
import type { CodeArtifact, TechSpec } from "../../../docs/schema/entities.js";
import { formatAsContext, retrieveMulti } from "../context/retriever.js";
import { parseCodeArtifactWithRetry } from "../guardrails/schema-validator.js";
import { getStartupSeconds } from "../tools/observability-tools.js";

/** Service startup SLA in seconds (800ms). Change is caught by the observability check. */
const STARTUP_SLA_SECONDS = 0.8;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Implement a TechSpec into a CodeArtifact.
 *
 * Uses a multi-step agentic loop so the agent can:
 *   1. Search for relevant golden examples.
 *   2. Read existing files for context.
 *   3. Generate code files.
 *   4. Self-verify with runTypeCheck and runLint.
 *   5. Iterate to fix errors.
 *
 * @param spec - The validated TechSpec from the Planning Agent.
 * @returns A Zod-validated CodeArtifact ready for the Security Audit.
 */
export async function executeSpec(spec: TechSpec): Promise<CodeArtifact> {
  console.log(`\n[executor] ▶ Executing: "${spec.title}"`);

  // ── Stage 3a: Retrieve golden examples and schema ──────────────────────────
  const contextDocs = await retrieveMulti(spec.title, [COLLECTIONS.CODE, COLLECTIONS.SCHEMA], 4);
  const contextBlock = formatAsContext(contextDocs, "Golden Examples & Schema Context");

  console.log(`[executor] Retrieved ${contextDocs.length} context chunks`);

  // ── Stage 3b: Multi-step agentic execution ─────────────────────────────────
  // Build a token-budget-aware spec payload: include only essential fields (O2).
  // The full spec is still Zod-validated; this is prompt-only truncation.
  const specPayload = JSON.stringify(
    {
      id: spec.id,
      title: spec.title,
      brief: spec.brief,
      acceptanceCriteria: spec.acceptanceCriteria,
      affectedPaths: spec.affectedPaths,
    },
    null,
    2,
  );

  const systemPrompt = `${agenticEngineer.systemPrompt}\n\n${contextBlock}`;
  const userPrompt = `Implement the following TechSpec. After generating all files, \nrun runTypeCheck and runLint to verify. Fix any errors before producing the final output.\n\nTechSpec:\n${specPayload}\n\nOutput a CodeArtifact JSON object with:\n- id: a unique nanoid\n- specId: "${spec.id}"\n- files: { "relative/path.ts": "full file contents", ... }\n- summary: what was built\n- verificationSteps: ["npm run typecheck", ...]\n- createdAt: current ISO-8601 timestamp`;

  const { text } = await generateText({
    model: agenticEngineer.model,
    maxRetries: 3,
    ...(agenticEngineer.maxSteps !== undefined ? { maxSteps: agenticEngineer.maxSteps } : {}),
    tools: executorTools,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // ── Stage 3c: Validate at boundary (with self-correction) ─────────────────
  const artifact = await parseCodeArtifactWithRetry(text, {
    model: agenticEngineer.model,
    systemPrompt,
    originalPrompt: userPrompt,
  });
  const fileCount = Object.keys(artifact.files).length;
  console.log(`[executor] ✓ Artifact: ${fileCount} file(s) generated`);

  // ── Stage 3d: Post-ship observability check ─────────────────────────────────
  const latestStartup = getStartupSeconds();
  const startupMs = Math.round(latestStartup * 1000);

  console.log(
    `[executor] ▶ observability-check startup=${startupMs}ms (SLA: ${STARTUP_SLA_SECONDS * 1000}ms)`,
  );

  if (latestStartup > STARTUP_SLA_SECONDS) {
    const warning = `[observability] startup=${startupMs}ms exceeds SLA of ${STARTUP_SLA_SECONDS * 1000}ms. Investigate cold-start path and defer non-critical initialisation.`;
    console.warn(`[executor] ⚠️  ${warning}`);
    // Surface the warning in the artifact summary so auditors and the logic critic can see it.
    return {
      ...artifact,
      summary: `${artifact.summary}\n\n[observability-warning] ${warning}`,
    };
  }

  return artifact;
}
