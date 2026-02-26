/**
 * src/core/agents/auditor.ts
 *
 * Auditor Agent — Stage 4 of the Knowledge Flywheel.
 * Owner: Security & DX Lead role.
 *
 * Audits a CodeArtifact for security vulnerabilities.
 * Critically: persists every critical/high finding to the "vulnerabilities"
 * Chroma collection so future agents learn from this run.
 */

import { generateText } from "ai";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { securityLead } from "../../../.agentic/roles/security-lead.js";
import { auditorTools } from "../../../.agentic/tools/index.js";
import type { AuditReport, CodeArtifact } from "../../../docs/schema/entities.js";
import { formatAsContext, retrieve } from "../context/retriever.js";
import { parseAuditReportWithRetry } from "../guardrails/schema-validator.js";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Security-audit a CodeArtifact.
 *
 * The agent retrieves past vulnerability findings first so it can detect
 * patterns the team has seen before. After auditing, it writes new critical/high
 * findings back to ChromaDB — closing the Knowledge Flywheel loop.
 *
 * @param artifact - The CodeArtifact from the Executor Agent.
 * @returns A Zod-validated AuditReport. `passed` is true iff no critical/high findings.
 */
export async function auditArtifact(artifact: CodeArtifact): Promise<AuditReport> {
  console.log(`\n[auditor] ▶ Auditing artifact: ${artifact.id}`);

  // ── Stage 4a: Retrieve past findings ──────────────────────────────────────
  const fileContents = Object.entries(artifact.files)
    .map(([path, content]) => `// ${path}\n${content}`)
    .join("\n\n---\n\n");

  // Primary pass: semantic similarity against code text
  const primaryFindings = await retrieve(fileContents.slice(0, 500), {
    collection: COLLECTIONS.VULNERABILITIES,
    topK: 5,
    minScore: 0.25,
  });

  // Secondary pass (F2): retrieve by vulnerability category so findings from
  // different code but the same category surface even when embedding similarity
  // is low (e.g. SQL injection in unrelated files).
  const categories = [
    ...new Set(
      primaryFindings
        .map((f) => f.metadata["category"] as string | undefined)
        .filter((c): c is string => typeof c === "string" && c.length > 0),
    ),
  ];

  const secondaryFindings =
    categories.length > 0
      ? await Promise.all(
          categories.map((cat) =>
            retrieve(cat, { collection: COLLECTIONS.VULNERABILITIES, topK: 3, minScore: 0.2 }),
          ),
        ).then((batches) => batches.flat())
      : [];

  // Merge, deduplicate by ID, sort by score
  const seenIds = new Set<string>();
  const pastFindings = [...primaryFindings, ...secondaryFindings]
    .filter((f) => {
      if (seenIds.has(f.id)) return false;
      seenIds.add(f.id);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8); // cap to avoid prompt bloat

  const context = formatAsContext(pastFindings, "Past Vulnerability Findings");

  console.log(`[auditor] Retrieved ${pastFindings.length} past findings (${primaryFindings.length} primary, ${secondaryFindings.length} secondary)`);

  // ── Stage 4b: Run security audit ──────────────────────────────────────────
  // Truncate file contents to stay within a reasonable token budget (O2)
  const MAX_FILE_CHARS = 6_000;
  const fileContentsForPrompt =
    fileContents.length > MAX_FILE_CHARS
      ? `${fileContents.slice(0, MAX_FILE_CHARS)}\n\n[... truncated for token budget ...]`
      : fileContents;

  const systemPrompt = `${securityLead.systemPrompt}\n\n${context}`;
  const userPrompt = `Audit the following code artifact for security vulnerabilities.\nFor every critical or high severity finding, call the writeVulnerability tool to persist it.\n\nArtifact ID: ${artifact.id}\nFiles:\n${fileContentsForPrompt}\n\nOutput an AuditReport JSON matching the schema in docs/schema/entities.ts.`;

  const { text } = await generateText({
    model: securityLead.model,
    maxRetries: 3,
    ...(securityLead.maxSteps !== undefined ? { maxSteps: securityLead.maxSteps } : {}),
    tools: auditorTools,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // ── Stage 4c: Validate at boundary (with self-correction) ─────────────────
  const report = await parseAuditReportWithRetry(text, {
    model: securityLead.model,
    systemPrompt,
    originalPrompt: userPrompt,
  });
  const highCount = report.findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;

  console.log(
    `[auditor] ✓ Report: ${report.passed ? "PASSED" : "FAILED"} (${report.findings.length} findings, ${highCount} critical/high)`,
  );

  return report;
}
