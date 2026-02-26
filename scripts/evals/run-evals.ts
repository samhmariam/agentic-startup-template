/**
 * scripts/evals/run-evals.ts
 *
 * CLI entry point for the eval harness.
 * Run: npm run evals
 *
 * Exits with code 1 if any suite score is below MIN_EVAL_SCORE.
 */

import { runAgentOutputEvals } from "./agent-output.eval.js";
import { computePrecisionAt5, runRetrievalEvals } from "./context-retrieval.eval.js";

const MIN_SCORE = Number(process.env["MIN_EVAL_SCORE"] ?? "0.70");

// ── Helpers ───────────────────────────────────────────────────────────────────

function bar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function scoreLabel(score: number): string {
  if (score >= 0.9) return "✅ Excellent";
  if (score >= MIN_SCORE) return "✓  Pass";
  return "✗  FAIL";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🧪 Agentic Pod OS — Eval Suite\n");
  console.log(`Minimum passing score: ${MIN_SCORE}\n`);

  let allPassed = true;

  // ── Suite 1: Context Retrieval ─────────────────────────────────────────────
  console.log("═".repeat(60));
  console.log("Suite 1: Context Retrieval (RAG precision)");
  console.log("═".repeat(60));

  const retrievalResults = await runRetrievalEvals();
  const retrievalScore = computePrecisionAt5(retrievalResults);

  for (const r of retrievalResults) {
    const icon = r.hit ? "  ✓" : "  ✗";
    console.log(`${icon} ${r.name}`);
    console.log(
      `    Score: ${r.score.toFixed(3)}  Top result: ${(r.topResult ?? "—").slice(0, 60)}...`,
    );
  }
  console.log(
    `\n  Precision@5: ${bar(retrievalScore)} ${(retrievalScore * 100).toFixed(0)}%  ${scoreLabel(retrievalScore)}`,
  );

  if (retrievalScore < MIN_SCORE) allPassed = false;

  // ── Suite 2: Agent Output Quality ─────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("Suite 2: Planning Agent Output (LLM-as-judge)");
  console.log("═".repeat(60));

  const agentResults = await runAgentOutputEvals();
  const agentScores = agentResults.map((r) => r.scores.overall);
  const avgAgentScore =
    agentScores.length > 0 ? agentScores.reduce((a, b) => a + b, 0) / agentScores.length : 0;

  for (const r of agentResults) {
    const { scores } = r;
    console.log(`\n  Brief  : ${r.brief.slice(0, 70)}...`);
    console.log(`  Spec   : ${r.specTitle}`);
    console.log(
      `  Scores : completeness=${scores.completeness.toFixed(2)} clarity=${scores.clarity.toFixed(2)} feasibility=${scores.feasibility.toFixed(2)} safety=${scores.safety.toFixed(2)}`,
    );
    console.log(`  Overall: ${scores.overall.toFixed(2)}  ${scoreLabel(scores.overall)}`);
    console.log(`  Judge  : ${scores.rationale.slice(0, 120)}`);
  }

  console.log(
    `\n  Average: ${bar(avgAgentScore)} ${(avgAgentScore * 100).toFixed(0)}%  ${scoreLabel(avgAgentScore)}`,
  );

  if (avgAgentScore < MIN_SCORE) allPassed = false;

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("Summary");
  console.log("═".repeat(60));
  console.log(
    `  Retrieval Precision@5 : ${(retrievalScore * 100).toFixed(0)}%  ${scoreLabel(retrievalScore)}`,
  );
  console.log(
    `  Agent Output Quality  : ${(avgAgentScore * 100).toFixed(0)}%  ${scoreLabel(avgAgentScore)}`,
  );
  console.log(
    `\n  Overall: ${allPassed ? "✅ ALL SUITES PASSED" : "❌ ONE OR MORE SUITES FAILED"}`,
  );

  process.exit(allPassed ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("Eval runner crashed:", err);
  process.exit(1);
});
