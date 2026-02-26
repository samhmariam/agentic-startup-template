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
import { vibeEngineer } from "../../../.agentic/roles/vibe-engineer.js";
import { polisherTools } from "../../../.agentic/tools/index.js";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { retrieveMulti, formatAsContext } from "../context/retriever.js";
import { parseCodeArtifact } from "../guardrails/schema-validator.js";
import { indexDocuments } from "../context/indexer.js";
import type { CodeArtifact, AuditReport, PolishedArtifact } from "../../../docs/schema/entities.js";

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

  const { text } = await generateText({
    model: vibeEngineer.model,
    ...(vibeEngineer.maxSteps !== undefined ? { maxSteps: vibeEngineer.maxSteps } : {}),
    tools: polisherTools,
    system: `${vibeEngineer.systemPrompt}\n\n${context}`,
    prompt: `Polish the following code artifact to meet the Enterprise Quality Bar.

Audit status: ${auditSummary}

Artifact:
${JSON.stringify(artifact, null, 2)}

Produce a polished CodeArtifact JSON with improved file contents.
If this artifact exemplifies a reusable pattern, also include:
  "nominateAsGolden": true,
  "goldenTitle": "<descriptive title>",
  "goldenTags": ["tag1", "tag2"]`,
  });

  // ── Stage 5c: Validate at boundary ────────────────────────────────────────
  const polished = parseCodeArtifact(text);

  // ── Stage 5d: Optional golden-example nomination ──────────────────────────
  // The schema doesn't include golden fields, so we read from raw JSON
  let rawParsed: Record<string, unknown> = {};
  try {
    rawParsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Ignore parse errors — polished artifact is already validated above
  }

  if (rawParsed["nominateAsGolden"] === true) {
    const goldenTitle = (rawParsed["goldenTitle"] as string | undefined) ?? polished.summary;
    const goldenTags = (rawParsed["goldenTags"] as string[] | undefined) ?? [];

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
