/**
 * src/core/context/query-cache.ts
 *
 * In-process TTL cache for ChromaDB embedding query results (O8).
 *
 * The text-embedding-3-small model is called for every retrieve() invocation.
 * Within a single flywheel run, several agents query the same collections with
 * similar or identical strings (e.g. the spec title used by both planner and
 * executor). This cache deduplicates those round-trips, reducing latency and
 * API cost.
 *
 * Usage:
 *   Pass `useCache: true` in RetrieveOptions to retrieve().
 *   The cache is shared across the process lifetime; entries expire after TTL.
 *
 * Design decisions:
 *   - In-memory only — no persistence across restarts (intentional).
 *   - Opt-in per call (default: false) so tests are never silently cached.
 *   - TTL default: 5 minutes — safe for a single flywheel run.
 *   - Eviction policy: TTL-based; no LRU cap (acceptable for low call volume).
 */

import type { QueryResult } from "../../../.agentic/memory/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  results: QueryResult[];
  expiresAt: number;
}

// ── QueryCache ────────────────────────────────────────────────────────────────

export class QueryCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1_000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Build a deterministic cache key from the query parameters.
   * Includes minScore so that calls with different score thresholds get
   * separate cache entries (avoids returning under-threshold results).
   */
  private static key(
    collection: string,
    query: string,
    topK: number,
    minScore: number,
  ): string {
    return `${collection}::${topK}::${minScore}::${query}`;
  }

  /** Return cached results if present and not expired; otherwise undefined. */
  get(collection: string, query: string, topK: number, minScore: number): QueryResult[] | undefined {
    const k = QueryCache.key(collection, query, topK, minScore);
    const entry = this.store.get(k);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(k);
      return undefined;
    }
    return entry.results;
  }

  /** Store results for the given query parameters. */
  set(
    collection: string,
    query: string,
    topK: number,
    minScore: number,
    results: QueryResult[],
  ): void {
    const k = QueryCache.key(collection, query, topK, minScore);
    this.store.set(k, { results, expiresAt: Date.now() + this.ttlMs });
  }

  /** Evict all expired entries. Call periodically to avoid unbounded growth. */
  evictExpired(): void {
    const now = Date.now();
    for (const [k, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(k);
    }
  }

  /** Wipe all cache entries (useful in tests). */
  clear(): void {
    this.store.clear();
  }

  /** Number of currently cached entries (for observability / tests). */
  get size(): number {
    return this.store.size;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Shared in-process cache. TTL = 5 minutes. */
export const queryCache = new QueryCache();
