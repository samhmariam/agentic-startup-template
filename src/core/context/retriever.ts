/**
 * src/core/context/retriever.ts
 *
 * Thin wrapper over ChromaMemoryStore.query() that returns ranked Document[]
 * and formats them for use as agent context blocks.
 */

import { getMemoryStore } from "../../../.agentic/memory/chroma-store.js";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import type { QueryResult } from "../../../.agentic/memory/types.js";
import { queryCache } from "./query-cache.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrieveOptions {
  collection?: string;
  topK?: number;
  minScore?: number;
  /** Optional Chroma metadata filter */
  where?: Record<string, unknown>;
  /**
   * O1/F4 — When set, only return documents whose `priority` metadata field
   * is >= this value. Merged into the `where` filter sent to Chroma.
   */
  minPriority?: number;
  /**
   * O8 — When true, serve results from the in-process TTL cache when available,
   * and populate the cache on miss. Safe to enable within a single flywheel run.
   * Defaults to false so tests are never silently cached.
   */
  useCache?: boolean;
}

// ── Retriever ─────────────────────────────────────────────────────────────────

/**
 * Retrieve the top-K most relevant documents for a query.
 *
 * @param query - Natural-language search query.
 * @param options - Collection, topK, minimum relevance score, and optional metadata filter.
 */
export async function retrieve(
  query: string,
  options: RetrieveOptions = {},
): Promise<QueryResult[]> {
  const { collection = COLLECTIONS.DEFAULT, topK = 5, minScore = 0.3, where, minPriority, useCache = false } =
    options;

  // Merge minPriority into the Chroma where filter (O1 / F4)
  const effectiveWhere: Record<string, unknown> | undefined =
    minPriority !== undefined
      ? { ...where, priority: { $gte: minPriority } }
      : where;

  // Serve from cache when opted-in (O8)
  if (useCache) {
    const cached = queryCache.get(collection, query, topK, minScore);
    if (cached !== undefined) return cached;
  }

  const store = getMemoryStore();
  const results = await store.query(collection, query, topK, effectiveWhere);
  const filtered = results.filter((r) => r.score >= minScore);

  if (useCache) {
    queryCache.set(collection, query, topK, minScore, filtered);
  }

  return filtered;
}

/**
 * Retrieve from multiple collections and merge results, de-duplicated by ID.
 * Results are sorted by score (descending) across all collections.
 *
 * @param query - Natural-language search query.
 * @param collections - Collections to search.
 * @param topKPerCollection - How many results to pull from each collection (default: 3).
 */
export async function retrieveMulti(
  query: string,
  collections: string[],
  topKPerCollection = 3,
): Promise<QueryResult[]> {
  const results = await Promise.all(
    collections.map((col) => retrieve(query, { collection: col, topK: topKPerCollection })),
  );

  const seen = new Set<string>();
  const merged: QueryResult[] = [];

  for (const batch of results) {
    for (const result of batch) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        merged.push(result);
      }
    }
  }

  return merged.sort((a, b) => b.score - a.score);
}

/**
 * Format retrieved documents as a Markdown context block for injection into a system prompt.
 */
export function formatAsContext(results: QueryResult[], label = "Retrieved Context"): string {
  if (results.length === 0) {
    return `## ${label}\n\n_No relevant context found._`;
  }

  const chunks = results.map(
    (r, i) => `### Chunk ${i + 1} (score: ${r.score.toFixed(3)})\n${r.content}`,
  );

  return `## ${label}\n\n${chunks.join("\n\n")}`;
}
