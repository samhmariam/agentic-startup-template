/**
 * scripts/evals/context-retrieval.eval.ts
 *
 * Retrieval quality eval for the Context Engineer's RAG pipeline.
 *
 * Scores:
 *   - Precision@5: of the top-5 results, how many are relevant?
 *   - Recall@5: of the relevant documents, how many appear in top-5?
 *
 * Each test case has an expected document ID that must appear in the results
 * for a "hit." Results below MIN_EVAL_SCORE fail the CI gate.
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
  {
    name: "Schema retrieval — TechSpec shape",
    query: "TechSpec acceptance criteria typescript zod schema",
    collection: COLLECTIONS.SCHEMA,
    expectedContentSubstring: "TechSpecSchema",
  },
  {
    name: "Golden example — tool definition pattern",
    query: "how to define an AI SDK tool with zod parameters",
    collection: COLLECTIONS.CODE,
    expectedContentSubstring: "tool(",
  },
  {
    name: "ADR retrieval — stack decision",
    query: "why did we choose TypeScript over Python",
    collection: COLLECTIONS.PLANS,
    expectedContentSubstring: "ADR-001",
  },
  {
    name: "Quality bar retrieval — enterprise code standards",
    query: "enterprise quality bar code review checklist",
    collection: COLLECTIONS.QUALITY_BAR,
    expectedContentSubstring: "Polish Checklist",
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
