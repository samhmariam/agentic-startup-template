/**
 * scripts/run-agentic-audit.ts
 *
 * CLI wrapper used by the security-audit GitHub Actions workflow.
 * Reads changed TypeScript files, builds a lightweight CodeArtifact,
 * runs the auditor agent, and writes .audit-report.json.
 *
 * Usage: npx tsx scripts/run-agentic-audit.ts src/foo.ts src/bar.ts
 */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { auditArtifact } from "../src/core/agents/auditor.js";
import type { CodeArtifact } from "../docs/schema/entities.js";

const filePaths = process.argv.slice(2);

if (filePaths.length === 0) {
  console.log("[audit] No files provided — nothing to audit.");
  process.exit(0);
}

async function main(): Promise<void> {
  console.log(`[audit] Auditing ${filePaths.length} file(s):`);
  filePaths.forEach((f) => console.log(`  - ${f}`));

  const files: Record<string, string> = {};
  for (const path of filePaths) {
    try {
      files[path] = await readFile(path, "utf-8");
    } catch {
      console.warn(`[audit] Could not read ${path} — skipping`);
    }
  }

  if (Object.keys(files).length === 0) {
    console.log("[audit] No readable files — exiting.");
    process.exit(0);
  }

  const artifact: CodeArtifact = {
    id: `ci-audit-${randomUUID().slice(0, 8)}`,
    specId: "ci",
    files,
    summary: `CI audit of ${Object.keys(files).length} changed file(s)`,
    verificationSteps: [],
    createdAt: new Date().toISOString(),
  };

  const report = await auditArtifact(artifact);

  await writeFile(".audit-report.json", JSON.stringify(report, null, 2), "utf-8");
  console.log(`[audit] Report written to .audit-report.json`);

  const highCount = report.findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;

  if (!report.passed) {
    console.error(`[audit] FAILED — ${highCount} critical/high finding(s). See .audit-report.json`);
    process.exit(1);
  }

  console.log(`[audit] PASSED — ${report.findings.length} finding(s), none critical/high.`);
}

main().catch((err: unknown) => {
  console.error("[audit] Fatal error:", err);
  process.exit(1);
});
