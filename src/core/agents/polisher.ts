/**
 * src/core/agents/polisher.ts
 *
 * Polisher Agent — Stage 5 of the Knowledge Flywheel.
 * Owner: Vibe Engineer role.
 *
 * Applies the final 5%: brand voice, clarity, enterprise-readiness signals,
 * and quality-bar checklist compliance.
 * Optionally nominates the polished artifact as a new Golden Example.
 */

import { generateText } from "ai";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { vibeEngineer } from "../../../.agentic/roles/vibe-engineer.js";
import { polisherTools } from "../../../.agentic/tools/index.js";
import type { AuditReport, CodeArtifact, PolishedArtifact } from "../../../docs/schema/entities.js";
import { indexDocuments } from "../context/indexer.js";
import { formatAsContext, retrieveMulti } from "../context/retriever.js";
import { parseCodeArtifactWithRetry } from "../guardrails/schema-validator.js";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Polish a CodeArtifact to enterprise-ready quality.
 *
 * Retrieves the quality-bar rubric and golden examples from ChromaDB.
 * If the artifact is nominated as a golden example, it is indexed into
 * the `code` collection for future agent runs.
 *
 * @param artifact - The CodeArtifact from the Executor Agent.
 * @param audit - The AuditReport for context (failed audits are surfaced to the agent).
 * @returns A polished CodeArtifact.
 */
export async function polishOutput(
  artifact: CodeArtifact,
  audit: AuditReport,
): Promise<PolishedArtifact> {
  console.log(`\n[polisher] ▶ Polishing artifact: ${artifact.id}`);

  // ── Stage 5a: Retrieve quality bar and golden examples ────────────────────
  const contextDocs = await retrieveMulti(
    `${artifact.summary} quality enterprise code`,
    [COLLECTIONS.QUALITY_BAR, COLLECTIONS.CODE],
    4,
  );
  const context = formatAsContext(contextDocs, "Quality Bar & Golden Examples");

  console.log(`[polisher] Retrieved ${contextDocs.length} context chunks`);

  // ── Stage 5b: Polish ────────────────────────────────────────────────────────
  const auditSummary = audit.passed
    ? "The security audit passed with no critical or high findings."
    : `AUDIT ISSUES:\n${audit.findings
        .filter((f) => f.severity === "critical" || f.severity === "high")
        .map((f) => `- [${f.severity.toUpperCase()}] ${f.category}: ${f.description}`)
        .join("\n")}`;

  const systemPrompt = `${vibeEngineer.systemPrompt}\n\n${context}`;
  const userPrompt = `Polish the following code artifact to meet the Enterprise Quality Bar.

Audit status: ${auditSummary}

Artifact:
${JSON.stringify(artifact, null, 2)}

Produce a polished CodeArtifact JSON with improved file contents.
If this artifact exemplifies a reusable pattern, also include:
  "nominateAsGolden": true,
  "goldenTitle": "<descriptive title>",
  "goldenTags": ["tag1", "tag2"]`;

  const { text } = await generateText({
    model: vibeEngineer.model,
    maxRetries: 3,
    ...(vibeEngineer.maxSteps !== undefined ? { maxSteps: vibeEngineer.maxSteps } : {}),
    tools: polisherTools,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // ── Stage 5c: Validate at boundary (with self-correction) ─────────────────
  const polished = await parseCodeArtifactWithRetry(text, {
    model: vibeEngineer.model,
    systemPrompt,
    originalPrompt: userPrompt,
  });

  // ── Stage 5d: Optional golden-example nomination ───────────────────────
  // Golden fields are now typed on CodeArtifact (schema-evolution O7 / F3)
  if (polished.nominateAsGolden === true) {
    const goldenTitle = polished.goldenTitle ?? polished.summary;
    const goldenTags = polished.goldenTags ?? [];

    await indexDocuments([
      {
        id: `golden:${polished.id}`,
        content: JSON.stringify(polished.files, null, 2),
        collection: COLLECTIONS.CODE,
        metadata: {
          title: goldenTitle,
          tags: goldenTags.join(","),
          nominatedBy: "vibe-engineer",
          isGolden: true,
          artifactId: polished.id,
        },
      },
    ]);
    console.log(`[polisher] ⭐ Nominated as golden example: "${goldenTitle}"`);
  }

  console.log(`[polisher] ✓ Polish complete`);
  return polished;
}
