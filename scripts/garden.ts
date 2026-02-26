/**
 * scripts/garden.ts
 *
 * The Gardening Agent — Garbage Collection for the Agentic Pod OS.
 *
 * Orchestrates a background run of the Auditor Agent across the entire codebase
 * to identify "AI Slop" and architectural drift. Produces two outputs:
 *
 *   garden-report.json  — machine-readable cleanup intents (for agent consumption)
 *   garden-report.md    — human-readable summary table
 *
 * The Gardening Agent has authority to open targeted "cleanup PRs" by emitting
 * structured CleanupIntent objects. A downstream CI step or agent can read
 * garden-report.json and execute the intents autonomously.
 *
 * Usage:
 *   pnpm garden
 *
 * Runtime note: requires OPENAI_API_KEY (calls the auditor agent for each batch).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { z } from "zod";
import type { AuditFinding, CodeArtifact } from "../docs/schema/entities.js";
import { auditArtifact } from "../src/core/agents/auditor.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const CleanupPrioritySchema = z.enum(["critical", "high", "medium", "low"]);
type CleanupPriority = z.infer<typeof CleanupPrioritySchema>;

const CleanupTypeSchema = z.enum([
  "centralize-helper", // move duplicated helper into shared util
  "add-zod-boundary", // wrap raw JSON.parse with Zod validation
  "remove-inline-retry", // replace hand-rolled retry with parseAgentOutputWithRetry
  "remove-ai-slop", // generic junk removal (TODOs, dead code, etc.)
  "fix-layer-violation", // resolve an architectural layer violation
]);
type CleanupType = z.infer<typeof CleanupTypeSchema>;

const CleanupIntentSchema = z.object({
  id: z.string(),
  type: CleanupTypeSchema,
  description: z.string(),
  affectedFiles: z.array(z.string()),
  suggestedTarget: z.string().optional(),
  priority: CleanupPrioritySchema,
  autoFixable: z.boolean(),
});
type CleanupIntent = z.infer<typeof CleanupIntentSchema>;

const GardenReportSchema = z.object({
  generatedAt: z.string(),
  totalFiles: z.number(),
  batchesRun: z.number(),
  findings: z.array(
    z.object({
      severity: z.string(),
      category: z.string(),
      description: z.string(),
      location: z.string().optional(),
      suggestion: z.string().optional(),
    }),
  ),
  cleanupIntents: z.array(CleanupIntentSchema),
  summary: z.string(),
});
type GardenReport = z.infer<typeof GardenReportSchema>;

// ── AI Slop detectors ─────────────────────────────────────────────────────────

interface SlopDetection {
  type: CleanupType;
  file: string;
  description: string;
  suggestedTarget?: string;
}

/**
 * Scan a batch of (path, content) pairs for common AI Slop patterns.
 * Returns a list of detected issues without calling the LLM.
 */
function detectSlopPatterns(files: Array<{ path: string; content: string }>): SlopDetection[] {
  const detections: SlopDetection[] = [];
  const functionNames = new Map<string, string[]>(); // functionName → [file, ...]

  for (const { path, content } of files) {
    // 1. Inline JSON.parse without Zod validation
    const jsonParseRe = /JSON\.parse\s*\(/g;
    const zodImport = /from\s+["']zod["']/;
    if (jsonParseRe.test(content) && !zodImport.test(content)) {
      detections.push({
        type: "add-zod-boundary",
        file: path,
        description: `${path} calls JSON.parse() but does not import Zod. All JSON.parse() calls must be wrapped with a Zod schema via parseAgentOutput() or schema.safeParse().`,
        suggestedTarget: "src/core/guardrails/schema-validator.ts",
      });
    }

    // 2. Hand-rolled retry loops (while/for loops around try/catch that look like retries)
    const retryLoopRe = /(?:while|for)\s*\([\s\S]{0,80}?\)\s*\{[\s\S]{0,300}?try\s*\{/;
    if (retryLoopRe.test(content) && !path.includes("schema-validator")) {
      detections.push({
        type: "remove-inline-retry",
        file: path,
        description: `${path} contains a hand-rolled retry loop. Use parseAgentOutputWithRetry() from src/core/guardrails/schema-validator.ts instead.`,
        suggestedTarget: "src/core/guardrails/schema-validator.ts",
      });
    }

    // 3. Leftover TODO / FIXME / HACK comments
    const todoRe = /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i;
    if (todoRe.test(content)) {
      detections.push({
        type: "remove-ai-slop",
        file: path,
        description: `${path} contains TODO/FIXME/HACK comments that should be resolved or converted to tracked issues.`,
      });
    }

    // 4. Collect top-level exported function names for duplicate detection
    const exportedFnRe = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let fnMatch = exportedFnRe.exec(content);
    while (fnMatch !== null) {
      const name = fnMatch[1];
      if (name !== undefined) {
        const existing = functionNames.get(name) ?? [];
        existing.push(path);
        functionNames.set(name, existing);
      }
      fnMatch = exportedFnRe.exec(content);
    }
  }

  // 5. Duplicate exported function names across files
  for (const [name, paths] of functionNames) {
    if (paths.length >= 2) {
      detections.push({
        type: "centralize-helper",
        description: `Exported function '${name}' is defined in ${paths.length} files: ${paths.join(", ")}. Centralise into a shared utility module.`,
        file: paths[0] ?? "",
        suggestedTarget: "src/core/utils/shared.ts",
      });
    }
  }

  return detections;
}

/**
 * Map a CleanupType + AuditFinding severity to a CleanupPriority.
 */
function toPriority(type: CleanupType, severity?: string): CleanupPriority {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (type === "add-zod-boundary" || type === "fix-layer-violation") return "high";
  if (type === "remove-inline-retry" || type === "centralize-helper") return "medium";
  return "low";
}

// ── Core gardening logic ──────────────────────────────────────────────────────

const ROOT = resolve(process.cwd());
const BATCH_SIZE = 5;

async function runGarden(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log("[garden] 🌱 Starting Gardening Agent run…");

  // 1. Glob all TypeScript source files
  const allFiles = await glob(["src/**/*.ts", "scripts/**/*.ts"], {
    cwd: ROOT,
    absolute: false,
    ignore: ["**/*.d.ts", "node_modules/**"],
  });

  console.log(`[garden] Found ${allFiles.length} source files to inspect`);

  // 2. Read file contents
  const fileContents: Array<{ path: string; content: string }> = [];
  for (const relPath of allFiles) {
    try {
      const content = readFileSync(resolve(ROOT, relPath), "utf-8");
      fileContents.push({ path: relPath, content });
    } catch {
      console.warn(`[garden] Could not read ${relPath} — skipping`);
    }
  }

  // 3. Batched auditor runs
  const batches: Array<typeof fileContents> = [];
  for (let i = 0; i < fileContents.length; i += BATCH_SIZE) {
    batches.push(fileContents.slice(i, i + BATCH_SIZE));
  }

  const allFindings: AuditFinding[] = [];

  console.log(`[garden] Running Auditor Agent on ${batches.length} batch(es)…`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (batch === undefined) continue;
    console.log(
      `[garden]   Batch ${i + 1}/${batches.length}: ${batch.map((f) => f.path).join(", ")}`,
    );

    const filesRecord: Record<string, string> = {};
    for (const { path, content } of batch) {
      filesRecord[path] = content;
    }

    const stubArtifact: CodeArtifact = {
      id: `garden-batch-${i}`,
      specId: "garden-run",
      files: filesRecord,
      summary: `Garden batch ${i + 1} of ${batches.length}`,
      verificationSteps: [],
      createdAt: startedAt,
    };

    try {
      const report = await auditArtifact(stubArtifact);
      allFindings.push(...report.findings);
    } catch (err: unknown) {
      console.warn(`[garden]   Batch ${i + 1} audit failed: ${String(err)}`);
    }
  }

  // 4. Static AI Slop detection (no LLM needed)
  const slopDetections = detectSlopPatterns(fileContents);
  console.log(`[garden] Static analysis: ${slopDetections.length} slop pattern(s) detected`);

  // 5. Build cleanup intents from slop detections + high-severity audit findings
  const intents: CleanupIntent[] = [];
  let gcSeq = 1;

  for (const slop of slopDetections) {
    // Deduplicate by description hash
    const id = `GC-${String(gcSeq++).padStart(3, "0")}`;
    const intent: CleanupIntent = {
      id,
      type: slop.type,
      description: slop.description,
      affectedFiles: [slop.file],
      ...(slop.suggestedTarget !== undefined ? { suggestedTarget: slop.suggestedTarget } : {}),
      priority: toPriority(slop.type),
      autoFixable: slop.type === "remove-ai-slop" || slop.type === "add-zod-boundary",
    };
    intents.push(intent);
  }

  for (const finding of allFindings) {
    if (finding.severity === "critical" || finding.severity === "high") {
      const id = `GC-${String(gcSeq++).padStart(3, "0")}`;
      const intent: CleanupIntent = {
        id,
        type: "remove-ai-slop",
        description: `[${finding.severity.toUpperCase()}] ${finding.category}: ${finding.description}`,
        affectedFiles: finding.location !== undefined ? [finding.location.split(":")[0] ?? ""] : [],
        priority: toPriority("remove-ai-slop", finding.severity),
        autoFixable: false,
      };
      intents.push(intent);
    }
  }

  // 6. Compose report
  const totalHigh = allFindings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;

  const report: GardenReport = {
    generatedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    batchesRun: batches.length,
    findings: allFindings,
    cleanupIntents: intents,
    summary: `Inspected ${allFiles.length} files across ${batches.length} batches. Found ${allFindings.length} audit finding(s) (${totalHigh} critical/high) and ${slopDetections.length} AI Slop pattern(s). ${intents.length} cleanup intent(s) emitted.`,
  };

  // Validate with Zod before writing
  GardenReportSchema.parse(report);

  // 7. Write machine-readable JSON
  const jsonPath = resolve(ROOT, "garden-report.json");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log("[garden] 📋 Machine-readable report: garden-report.json");

  // 8. Write human-readable markdown
  const mdPath = resolve(ROOT, "garden-report.md");
  writeFileSync(mdPath, buildMarkdownReport(report));
  console.log("[garden] 📝 Human-readable report:   garden-report.md");

  console.log(`\n[garden] 🌱 Done. ${intents.length} cleanup intent(s) ready for execution.`);
  console.log(`         ${report.summary}`);
}

// ── Markdown report builder ───────────────────────────────────────────────────

function buildMarkdownReport(report: GardenReport): string {
  const critical = report.cleanupIntents.filter((i) => i.priority === "critical").length;
  const high = report.cleanupIntents.filter((i) => i.priority === "high").length;
  const medium = report.cleanupIntents.filter((i) => i.priority === "medium").length;
  const low = report.cleanupIntents.filter((i) => i.priority === "low").length;

  const rows = report.cleanupIntents
    .map(
      (i) =>
        `| ${i.id} | ${i.type} | ${i.priority} | ${i.description.slice(0, 80)}${i.description.length > 80 ? "…" : ""} | ${i.autoFixable ? "✓" : "—"} |`,
    )
    .join("\n");

  return `# Garden Report

> Generated: ${report.generatedAt}

## Summary

${report.summary}

## Statistics

| Metric | Value |
|--------|-------|
| Files inspected | ${report.totalFiles} |
| Auditor batches | ${report.batchesRun} |
| Total audit findings | ${report.findings.length} |
| Cleanup intents | ${report.cleanupIntents.length} |
| Critical | ${critical} |
| High | ${high} |
| Medium | ${medium} |
| Low | ${low} |

## Cleanup Intents

| ID | Type | Priority | Description | Auto-fixable |
|----|------|----------|-------------|--------------|
${rows || "*(no intents — all clear!)*"}

## Agent Consumption

Feed \`garden-report.json\` directly into an agent's context window to execute cleanup:

\`\`\`bash
# Example: pipe intents into a flywheel run
cat garden-report.json | jq '.cleanupIntents[] | select(.priority == "high")' | pnpm flywheel --autoMerge
\`\`\`

Each \`cleanupIntent\` object contains:
- \`id\`: Stable identifier for the intent (e.g., \`GC-001\`)
- \`type\`: The kind of cleanup required
- \`description\`: Plain-English description with enough context to act on
- \`affectedFiles\`: Files that need to change
- \`suggestedTarget\`: Where to move the centralised logic (if applicable)
- \`priority\`: \`critical | high | medium | low\`
- \`autoFixable\`: Whether an agent can apply the fix without human review
`;
}

// ── Entry point ───────────────────────────────────────────────────────────────

runGarden().catch((err: unknown) => {
  console.error("[garden] Fatal error:", err);
  process.exit(1);
});
