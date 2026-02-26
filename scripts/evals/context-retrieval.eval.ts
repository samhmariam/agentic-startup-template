/**
 * scripts/evals/context-retrieval.eval.ts
 *
 * Retrieval quality eval for the Context Engineer's RAG pipeline.
 *
 * Scores:
 *   - Precision@K: of the top-K results, how many are relevant?
 *   - Recall@K: of the relevant documents, how many appear in top-K?
 *
 * Each test case has an expected document ID that must appear in the results
 * for a "hit." Results below MIN_EVAL_SCORE fail the CI gate.
 *
 * Test suite: 12 cases spanning all collections and query types (O5 / F7).
 */

import { COLLECTIONS } from "../../.agentic/memory/types.js";
import { retrieve } from "../../src/core/context/retriever.js";

// ── Test cases ────────────────────────────────────────────────────────────────

interface RetrievalTestCase {
  name: string;
  query: string;
  collection: string;
  /** Substring that must appear in at least one returned document's content */
  expectedContentSubstring: string;
}

const TEST_CASES: RetrievalTestCase[] = [
  // ─ SCHEMA collection ─────────────────────────────────────────────────
  {
    name: "Schema retrieval — TechSpec shape",
    query: "TechSpec acceptance criteria typescript zod schema",
    collection: COLLECTIONS.SCHEMA,
    expectedContentSubstring: "TechSpecSchema",
  },
  {
    name: "Schema retrieval — CodeArtifact fields",
    query: "CodeArtifact files verificationSteps zod schema",
    collection: COLLECTIONS.SCHEMA,
    expectedContentSubstring: "CodeArtifactSchema",
  },
  {
    name: "Schema retrieval — AuditReport structure",
    query: "AuditReport findings severity passed zod",
    collection: COLLECTIONS.SCHEMA,
    expectedContentSubstring: "AuditReportSchema",
  },
  {
    name: "Schema retrieval — schema evolution convention",
    query: "schema evolution add optional field convention breaking change",
    collection: COLLECTIONS.SCHEMA,
    expectedContentSubstring: "SCHEMA EVOLUTION CONVENTION",
  },

  // ─ CODE collection ──────────────────────────────────────────────────
  {
    name: "Golden example — tool definition pattern",
    query: "how to define an AI SDK tool with zod parameters",
    collection: COLLECTIONS.CODE,
    expectedContentSubstring: "tool(",
  },
  {
    name: "Golden example — agent function pattern",
    query: "async agent function generateText system prompt context",
    collection: COLLECTIONS.CODE,
    expectedContentSubstring: "generateText",
  },

  // ─ PLANS collection ────────────────────────────────────────────────
  {
    name: "ADR retrieval — stack decision",
    query: "why did we choose TypeScript over Python",
    collection: COLLECTIONS.PLANS,
    expectedContentSubstring: "ADR-001",
  },
  {
    name: "ADR retrieval — Vercel AI SDK rationale",
    query: "AI SDK model provider abstraction multi-vendor",
    collection: COLLECTIONS.PLANS,
    expectedContentSubstring: "Vercel AI SDK",
  },

  // ─ QUALITY_BAR collection ─────────────────────────────────────────
  {
    name: "Quality bar retrieval — enterprise code standards",
    query: "enterprise quality bar code review checklist",
    collection: COLLECTIONS.QUALITY_BAR,
    expectedContentSubstring: "Polish Checklist",
  },
  {
    name: "Quality bar retrieval — accessibility and documentation",
    query: "JSDoc comments documentation accessibility readability",
    collection: COLLECTIONS.QUALITY_BAR,
    expectedContentSubstring: "JSDoc",
  },

  // ─ DEFAULT collection (architecture / roles) ────────────────────
  {
    name: "Architecture retrieval — flywheel lifecycle stages",
    query: "flywheel seed plan execute audit polish lifecycle stages",
    collection: COLLECTIONS.DEFAULT,
    expectedContentSubstring: "flywheel",
  },
  {
    name: "Role retrieval — security lead responsibilities",
    query: "security lead vulnerability OWASP audit responsibilities",
    collection: COLLECTIONS.DEFAULT,
    expectedContentSubstring: "security",
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export interface RetrievalEvalResult {
  name: string;
  hit: boolean;
  score: number;
  topResult?: string;
}

export async function runRetrievalEvals(): Promise<RetrievalEvalResult[]> {
  const results: RetrievalEvalResult[] = [];

  for (const tc of TEST_CASES) {
    const docs = await retrieve(tc.query, { collection: tc.collection, topK: 5 });
    const hit = docs.some((d) => d.content.includes(tc.expectedContentSubstring));
    const topScore = docs[0]?.score ?? 0;

    results.push({
      name: tc.name,
      hit,
      score: topScore,
      ...(docs[0] !== undefined ? { topResult: docs[0].content.slice(0, 120) } : {}),
    });
  }

  return results;
}

export function computePrecisionAt5(results: RetrievalEvalResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.hit).length / results.length;
}
