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
import { securityLead } from "../../../.agentic/roles/security-lead.js";
import { auditorTools } from "../../../.agentic/tools/index.js";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { retrieve, formatAsContext } from "../context/retriever.js";
import { parseAuditReport } from "../guardrails/schema-validator.js";
import type { CodeArtifact, AuditReport } from "../../../docs/schema/entities.js";

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

  const pastFindings = await retrieve(fileContents.slice(0, 500), {
    collection: COLLECTIONS.VULNERABILITIES,
    topK: 5,
    minScore: 0.25,
  });
  const context = formatAsContext(pastFindings, "Past Vulnerability Findings");

  console.log(`[auditor] Retrieved ${pastFindings.length} past findings`);

  // ── Stage 4b: Run security audit ──────────────────────────────────────────
  const { text } = await generateText({
    model: securityLead.model,
    ...(securityLead.maxSteps !== undefined ? { maxSteps: securityLead.maxSteps } : {}),
    tools: auditorTools,
    system: `${securityLead.systemPrompt}\n\n${context}`,
    prompt: `Audit the following code artifact for security vulnerabilities.
For every critical or high severity finding, call the writeVulnerability tool to persist it.

Artifact ID: ${artifact.id}
Files:
${fileContents}

Output an AuditReport JSON matching the schema in docs/schema/entities.ts.`,
  });

  // ── Stage 4c: Validate at boundary ────────────────────────────────────────
  const report = parseAuditReport(text);
  const highCount = report.findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;

  console.log(
    `[auditor] ✓ Report: ${report.passed ? "PASSED" : "FAILED"} (${report.findings.length} findings, ${highCount} critical/high)`,
  );

  return report;
}
