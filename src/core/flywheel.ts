/**
 * src/core/flywheel.ts
 *
 * The Knowledge Flywheel Orchestrator.
 *
 * Runs all five stages of the agentic lifecycle in sequence:
 *   1. Context Seeding  (Context Engineer)
 *   2. Strategic Planning (Product Architect)
 *   3. Agentic Execution  (Agentic Engineer)
 *   4. Security Verification (Security & DX Lead)
 *   5. Human Polish    (Vibe Engineer)
 *
 * Every stage's output is type-validated before being passed to the next.
 * Findings and golden examples accumulate in ChromaDB — the flywheel spins
 * faster with every run.
 *
 * Entry points:
 *   - CLI:    npm run flywheel "<brief>"
 *   - Import: import { runFlywheel } from "./src/core/flywheel.js"
 */

import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { FlywheelResult, TechSpec } from "../../docs/schema/entities.js";
import { auditArtifact } from "./agents/auditor.js";
import { executeSpec } from "./agents/executor.js";
import { runLogicReview } from "./agents/logic-critic.js";
import { planFeature } from "./agents/planner.js";
import { polishOutput } from "./agents/polisher.js";
import { seedContext } from "./context/seeder.js";

// ── Flywheel ──────────────────────────────────────────────────────────────────

export interface FlywheelOptions {
  /** Re-seed the knowledge base before planning (default: false for speed) */
  reseed?: boolean;
  /** Abort after the audit if it fails (default: false — polish runs regardless) */
  haltOnAuditFailure?: boolean;
  /**
   * Autonomous Merge (Harness Engineering — Trust Gate).
   *
   * When true, the flywheel runs a Logic Critic review after Stage 4.
   * If both the Security Sentinel (auditor) and the Logic Critic return a
   * "Perfect Pass," the HITL `approveSpec` gate is bypassed entirely.
   *
   * Trust Gate conditions:
   *   • `audit.passed === true` (zero critical/high security findings)
   *   • `logicReview.passed === true` (all acceptance criteria covered)
   *
   * If either check fails, execution falls back to the `approveSpec` gate
   * (or throws if `approveSpec` is also absent).
   *
   * @default false
   */
  autoMerge?: boolean;
  /**
   * Human-in-the-Loop approval gate, called after Stage 2 (Planning) and
   * before Stage 3 (Execution).
   *
   * Receives the generated TechSpec; return it (optionally amended) to proceed,
   * or throw to abort the run. If omitted, the flywheel runs fully automated.
   *
   * @example
   * // CLI interactive approval:
   * runFlywheel(brief, { approveSpec: createCliApprovalFn() })
   *
   * // Programmatic gate (e.g., Slack bot or CI check):
   * runFlywheel(brief, { approveSpec: async (spec) => {
   *   await postToSlack(spec);
   *   return spec;
   * }})
   */
  approveSpec?: (spec: TechSpec) => Promise<TechSpec>;
}

/**
 * Run the complete Knowledge Flywheel for a given feature brief.
 *
 * @param brief - Plain-English description of the feature to build.
 * @param options - Optional runtime flags.
 * @returns A complete FlywheelResult with all stage artifacts.
 */
export async function runFlywheel(
  brief: string,
  options: FlywheelOptions = {},
): Promise<FlywheelResult> {
  const runId = randomUUID();
  const startedAt = Date.now();

  console.log("─".repeat(60));
  console.log(`🌀 Knowledge Flywheel`);
  console.log(`   Run ID : ${runId}`);
  console.log(`   Brief  : ${brief.slice(0, 80)}`);
  console.log(`   Time   : ${new Date().toISOString()}`);
  console.log("─".repeat(60));

  // ── Stage 1: Context Seeding ───────────────────────────────────────────────
  if (options.reseed) {
    console.log("\n📚 Stage 1 — Context Seeding");
    const seedResult = await seedContext();
    console.log(
      `[flywheel] Seeded ${seedResult.totalDocuments} chunks from ${seedResult.totalFiles} files`,
    );
  } else {
    console.log("\n📚 Stage 1 — Context Seeding (skipped; run with reseed:true to refresh)");
  }

  // ── Stage 2: Strategic Planning ────────────────────────────────────────────
  console.log("\n📐 Stage 2 — Strategic Planning");
  const spec = await planFeature(brief);

  // ── HITL Approval Gate (optional) ─────────────────────────────────────────
  let approvedSpec = spec;
  if (options.approveSpec && !options.autoMerge) {
    // When autoMerge:true the Trust Gate (post-Stage 4) takes over from the HITL gate.
    console.log("\n⏸  Awaiting approval — inspect the spec above, then respond.");
    approvedSpec = await options.approveSpec(spec);
    console.log("[flywheel] ✓ Spec approved — proceeding to execution.");
  }

  // ── Stage 3: Agentic Execution ─────────────────────────────────────────────
  console.log("\n⚙️  Stage 3 — Agentic Execution");
  const artifact = await executeSpec(approvedSpec);

  // ── Stage 4: Security Verification ────────────────────────────────────────
  console.log("\n🔒 Stage 4 — Security Verification");
  const audit = await auditArtifact(artifact);

  if (!audit.passed && options.haltOnAuditFailure) {
    const highFindings = audit.findings
      .filter((f) => f.severity === "critical" || f.severity === "high")
      .map((f) => `  [${f.severity.toUpperCase()}] ${f.description}`)
      .join("\n");
    throw new Error(
      `[flywheel] Audit failed — halting as requested.\n\nHigh-severity findings:\n${highFindings}`,
    );
  }

  // ── Trust Gate (Harness Engineering — autoMerge) ───────────────────────────
  let autoMerged = false;
  let logicReviewPassed: boolean | undefined;

  if (options.autoMerge) {
    console.log("\n🤖 Trust Gate — Logic Critic review");
    const logicReview = await runLogicReview(approvedSpec, artifact);
    logicReviewPassed = logicReview.passed;

    const perfectPass = audit.passed && logicReview.passed;

    if (perfectPass) {
      console.log(
        "[flywheel] ✅ Trust Gate PASSED — auto-merging (Security Sentinel + Logic Critic: Perfect Pass)",
      );
      autoMerged = true;
      // Skip the approveSpec HITL gate entirely — both sentinels returned Perfect Pass.
    } else {
      const failReasons: string[] = [];
      if (!audit.passed)
        failReasons.push(
          `Security Sentinel: ${audit.findings.filter((f) => f.severity === "critical" || f.severity === "high").length} critical/high finding(s)`,
        );
      if (!logicReview.passed) failReasons.push(`Logic Critic: ${logicReview.issues.join("; ")}`);

      console.warn(`[flywheel] ⚠️  Trust Gate FAILED — ${failReasons.join(" | ")}`);

      if (options.approveSpec) {
        console.log("\n⏸  Trust Gate failed — falling back to manual approval gate.");
        approvedSpec = await options.approveSpec(approvedSpec);
        console.log("[flywheel] ✓ Manual approval received.");
      } else {
        throw new Error(
          `[flywheel] Trust Gate failed and no approveSpec fallback is configured.\n\n${failReasons.join("\n")}`,
        );
      }
    }
  }

  // ── Stage 5: Human Polish ──────────────────────────────────────────────────
  console.log("\n✨ Stage 5 — Human Polish");
  const polished = await polishOutput(artifact, audit);

  // ── Result ─────────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startedAt;
  const result: FlywheelResult = {
    runId,
    brief,
    spec,
    artifact,
    audit,
    polished,
    completedAt: new Date().toISOString(),
    durationMs,
    ...(options.autoMerge !== undefined ? { autoMerged, logicReviewPassed } : {}),
  };

  console.log("\n" + "─".repeat(60));
  console.log(`✅ Flywheel complete in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`   Spec    : ${spec.title}`);
  console.log(`   Files   : ${Object.keys(polished.files).length}`);
  console.log(
    `   Audit   : ${audit.passed ? "PASSED ✓" : "FAILED ✗"} (${audit.findings.length} findings)`,
  );
  console.log("─".repeat(60));

  return result;
}

// ── HITL helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a readline-based approval callback for use with `FlywheelOptions.approveSpec`.
 *
 * Prints the spec summary to stdout and blocks until the operator types "y" or "n".
 * - "y" → returns the spec unchanged; execution continues.
 * - "n" → throws, aborting the flywheel run.
 *
 * For non-interactive environments, supply your own `approveSpec` callback
 * instead (e.g., a Slack bot, a GitHub PR check, or a web form).
 *
 * @example
 * pnpm flywheel "Add /health endpoint"
 * // In runFlywheel: { approveSpec: createCliApprovalFn() }
 */
export function createCliApprovalFn(): (spec: TechSpec) => Promise<TechSpec> {
  return async (spec: TechSpec): Promise<TechSpec> => {
    console.log("\n" + "─".repeat(60));
    console.log("📋 SPEC REVIEW — Human-in-the-Loop Gate");
    console.log("─".repeat(60));
    console.log(`  Title  : ${spec.title}`);
    console.log(`  Brief  : ${spec.brief.slice(0, 120)}`);
    console.log(`  Paths  : ${spec.affectedPaths.join(", ") || "(none)"}`);
    console.log(`  ADRs   : ${spec.referencedADRs?.join(", ") || "(none)"}`);
    console.log("\n  Acceptance Criteria:");
    spec.acceptanceCriteria.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
    console.log("─".repeat(60));

    const rl = createInterface({ input, output });
    try {
      const answer = await rl.question("\nApprove and proceed to execution? [y/n]: ");
      if (answer.trim().toLowerCase() !== "y") {
        throw new Error("[flywheel] Spec rejected by operator — run aborted.");
      }
    } finally {
      rl.close();
    }

    return spec;
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

import { resolve } from "node:path";

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const args = process.argv.slice(2);
  const approveFlag = args.includes("--approve");
  const brief =
    args.filter((a) => a !== "--approve").join(" ") || "Add a hello-world REST endpoint";

  runFlywheel(brief, {
    reseed: false,
    ...(approveFlag ? { approveSpec: createCliApprovalFn() } : {}),
  }).catch((err: unknown) => {
    console.error("[flywheel] Fatal error:", err);
    process.exit(1);
  });
}
