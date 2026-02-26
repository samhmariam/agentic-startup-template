/**
 * .agentic/memory/chroma-store.ts
 *
 * ChromaDB implementation of the MemoryStore interface.
 * Uses the embedded JavaScript client — no Docker or remote server required for local dev.
 *
 * For production deployments with >1M vectors, swap CHROMA_URL in .env to point
 * at a remote Chroma server or a hosted alternative (Qdrant, Pinecone) and adapt
 * the client initialisation below. The MemoryStore interface remains unchanged.
 */

import { ChromaClient, type Collection, OpenAIEmbeddingFunction } from "chromadb";
import type { MemoryDocument, MemoryStore, QueryResult } from "./types.js";

// ── Embedding function ────────────────────────────────────────────────────────

function buildEmbeddingFunction(): OpenAIEmbeddingFunction {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. " +
        "Copy .env.example to .env and add your key, or set the environment variable.",
    );
  }
  return new OpenAIEmbeddingFunction({
    openai_api_key: apiKey,
    openai_model: "text-embedding-3-small",
  });
}

// ── ChromaMemoryStore ─────────────────────────────────────────────────────────

export class ChromaMemoryStore implements MemoryStore {
  private readonly client: ChromaClient;
  private readonly embeddingFn: OpenAIEmbeddingFunction;
  /** Cached collection handles to avoid repeated round-trips */
  private readonly colCache = new Map<string, Collection>();

  constructor(options?: { path?: string; url?: string }) {
    const url = options?.url ?? process.env["CHROMA_URL"];
    const path = options?.path ?? process.env["CHROMA_PATH"] ?? "./__chroma__";

    if (url) {
      this.client = new ChromaClient({ path: url });
    } else {
      // Embedded (local) mode
      this.client = new ChromaClient({ path });
    }

    this.embeddingFn = buildEmbeddingFunction();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async getOrCreateCollection(name: string): Promise<Collection> {
    const cached = this.colCache.get(name);
    if (cached) return cached;

    const col = await this.client.getOrCreateCollection({
      name,
      embeddingFunction: this.embeddingFn,
      metadata: { "hnsw:space": "cosine" },
    });

    this.colCache.set(name, col);
    return col;
  }

  // ── MemoryStore implementation ──────────────────────────────────────────────

  async upsert(collection: string, documents: MemoryDocument[]): Promise<void> {
    if (documents.length === 0) return;

    const col = await this.getOrCreateCollection(collection);

    await col.upsert({
      ids: documents.map((d) => d.id),
      documents: documents.map((d) => d.content),
      metadatas: documents.map((d) => d.metadata as Record<string, string | number | boolean>),
    });
  }

  async query(
    collection: string,
    queryText: string,
    topK = 5,
    where?: Record<string, unknown>,
  ): Promise<QueryResult[]> {
    const col = await this.getOrCreateCollection(collection);

    const results = await col.query({
      queryTexts: [queryText],
      nResults: topK,
      ...(where !== undefined ? { where: where as Record<string, string | number | boolean> } : {}),
    });

    const ids = results.ids[0] ?? [];
    const docs = results.documents[0] ?? [];
    const metas = results.metadatas[0] ?? [];
    const distances = results.distances?.[0] ?? [];

    return ids.map((id, i) => ({
      id,
      content: docs[i] ?? "",
      metadata: (metas[i] as Record<string, unknown>) ?? {},
      // Chroma returns L2 or cosine *distance* (0 = identical). Convert to similarity.
      score: 1 - (distances[i] ?? 0),
    }));
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const col = await this.getOrCreateCollection(collection);
    await col.delete({ ids });
  }

  async clear(collection: string, deleteCollection = false): Promise<void> {
    if (deleteCollection) {
      await this.client.deleteCollection({ name: collection });
      this.colCache.delete(collection);
    } else {
      const col = await this.getOrCreateCollection(collection);
      const allIds = await col.get({ include: [] });
      if (allIds.ids.length > 0) {
        await col.delete({ ids: allIds.ids });
      }
    }
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _instance: ChromaMemoryStore | undefined;

/**
 * Returns a shared ChromaMemoryStore instance (lazy-initialised).
 * Use this in application code to avoid creating multiple Chroma clients.
 */
export function getMemoryStore(): ChromaMemoryStore {
  _instance ??= new ChromaMemoryStore();
  return _instance;
}
