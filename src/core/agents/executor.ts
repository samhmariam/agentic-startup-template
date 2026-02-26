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
import { agenticEngineer } from "../../../.agentic/roles/agentic-engineer.js";
import { executorTools } from "../../../.agentic/tools/index.js";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { retrieveMulti, formatAsContext } from "../context/retriever.js";
import { parseCodeArtifact } from "../guardrails/schema-validator.js";
import type { TechSpec, CodeArtifact } from "../../../docs/schema/entities.js";

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
  const { text } = await generateText({
    model: agenticEngineer.model,
    ...(agenticEngineer.maxSteps !== undefined ? { maxSteps: agenticEngineer.maxSteps } : {}),
    tools: executorTools,
    system: `${agenticEngineer.systemPrompt}\n\n${contextBlock}`,
    prompt: `Implement the following TechSpec. After generating all files, 
run runTypeCheck and runLint to verify. Fix any errors before producing the final output.

TechSpec:
${JSON.stringify(spec, null, 2)}

Output a CodeArtifact JSON object with:
- id: a unique nanoid
- specId: "${spec.id}"
- files: { "relative/path.ts": "full file contents", ... }
- summary: what was built
- verificationSteps: ["npm run typecheck", ...]
- createdAt: current ISO-8601 timestamp`,
  });

  // ── Stage 3c: Validate at boundary ────────────────────────────────────────
  const artifact = parseCodeArtifact(text);
  const fileCount = Object.keys(artifact.files).length;
  console.log(`[executor] ✓ Artifact: ${fileCount} file(s) generated`);

  return artifact;
}
