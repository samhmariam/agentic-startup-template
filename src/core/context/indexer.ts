/**
 * src/core/context/indexer.ts
 *
 * Takes an array of Documents, generates embeddings, and upserts into ChromaDB.
 * Handles deduplication by content hash — re-indexing the same content is a no-op.
 *
 * Used by: seeder.ts, and any agent that creates canonical knowledge (e.g., after a polish pass).
 */

import { createHash } from "node:crypto";
import { getMemoryStore } from "../../../.agentic/memory/chroma-store.js";
import type { MemoryDocument } from "../../../.agentic/memory/types.js";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { sanitize } from "../guardrails/pii-filter.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IndexInput {
  content: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  /** If provided, used as the document ID. Otherwise, a content hash is used. */
  id?: string;
}

export interface IndexResult {
  indexed: number;
  skipped: number;
  collection: string;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

const MAX_CHUNK_CHARS = 1_500;
const HEADING_REGEX = /^#{1,4} .+$/m;

/**
 * Split a document into chunks ≤ MAX_CHUNK_CHARS characters.
 * Strategy: split on Markdown headings first; fall back to paragraph breaks; then hard-cut.
 */
export function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

  // Try heading splits
  const headingSections = trimmed.split(/(?=^#{1,4} )/m).filter(Boolean);
  if (headingSections.length > 1) {
    return headingSections.flatMap((s) => chunkText(s.trim()));
  }

  // Try paragraph splits
  const paragraphs = trimmed.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length > 1) {
    const chunks: string[] = [];
    let current = "";
    for (const p of paragraphs) {
      if ((current + "\n\n" + p).length <= MAX_CHUNK_CHARS) {
        current = current ? `${current}\n\n${p}` : p;
      } else {
        if (current) chunks.push(current);
        current = p.length <= MAX_CHUNK_CHARS ? p : p.slice(0, MAX_CHUNK_CHARS);
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // Hard cut
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += MAX_CHUNK_CHARS) {
    chunks.push(trimmed.slice(i, i + MAX_CHUNK_CHARS));
  }
  return chunks;
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/** Deterministic ID from content — re-indexing identical content is a safe no-op. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// ── Indexer ───────────────────────────────────────────────────────────────────

/**
 * Index an array of inputs into the vector store.
 *
 * Each input is:
 *   1. PII-sanitised before embedding.
 *   2. Chunked if it exceeds MAX_CHUNK_CHARS.
 *   3. Deduplicated by content hash.
 *
 * @returns Summary of how many documents were indexed vs skipped.
 */
export async function indexDocuments(inputs: IndexInput[]): Promise<IndexResult> {
  const store = getMemoryStore();
  const collection = inputs[0]?.collection ?? COLLECTIONS.DEFAULT;

  const documents: MemoryDocument[] = [];

  for (const input of inputs) {
    const col = input.collection ?? collection;
    const sanitised = sanitize(input.content);
    const chunks = chunkText(sanitised);

    chunks.forEach((chunk, i) => {
      const id = input.id
        ? chunks.length > 1
          ? `${input.id}-chunk${i}`
          : input.id
        : contentHash(chunk);

      documents.push({
        id,
        content: chunk,
        metadata: {
          ...input.metadata,
          collection: col,
          chunkIndex: i,
          totalChunks: chunks.length,
          indexedAt: new Date().toISOString(),
          hasHeading: HEADING_REGEX.test(chunk),
        },
      });
    });
  }

  if (documents.length === 0) return { indexed: 0, skipped: inputs.length, collection };

  await store.upsert(collection, documents);
  return { indexed: documents.length, skipped: 0, collection };
}
