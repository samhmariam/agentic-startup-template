/**
 * .agentic/memory/types.ts
 *
 * Interfaces for the memory layer.
 * The memory layer is owned by the Context Engineer and provides
 * a consistent API for storing and retrieving knowledge across all agent roles.
 */

// ── Core Document ─────────────────────────────────────────────────────────────

export interface MemoryDocument {
  /** Stable, collision-resistant ID (e.g., SHA-256 content hash or file:line ref) */
  id: string;
  /** The raw text content that was embedded */
  content: string;
  /** Arbitrary metadata for filtering and provenance */
  metadata: Record<string, unknown>;
}

export interface QueryResult extends MemoryDocument {
  /** Cosine similarity score (0–1; higher = more relevant) */
  score: number;
}

// ── Store Interface ───────────────────────────────────────────────────────────

export interface MemoryStore {
  /**
   * Insert or update documents in a named collection.
   * Documents with the same `id` are overwritten (idempotent).
   */
  upsert(collection: string, documents: MemoryDocument[]): Promise<void>;

  /**
   * Semantic search over a named collection.
   * @param collection - Collection to search.
   * @param query - Natural-language query text (will be embedded).
   * @param topK - Maximum number of results to return (default: 5).
   * @param where - Optional metadata filter (Chroma `where` clause format).
   */
  query(
    collection: string,
    query: string,
    topK?: number,
    where?: Record<string, unknown>,
  ): Promise<QueryResult[]>;

  /**
   * Delete documents by their IDs from a named collection.
   */
  delete(collection: string, ids: string[]): Promise<void>;

  /**
   * Delete all documents in a collection, then (optionally) the collection itself.
   */
  clear(collection: string, deleteCollection?: boolean): Promise<void>;
}

// ── Collection Names (keep in sync with docs/schema/README.md) ───────────────

export const COLLECTIONS = {
  PLANS: "plans",
  CODE: "code",
  VULNERABILITIES: "vulnerabilities",
  QUALITY_BAR: "quality-bar",
  SCHEMA: "schema",
  DEFAULT: "default",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
