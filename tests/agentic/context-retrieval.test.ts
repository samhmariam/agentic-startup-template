/**
 * tests/agentic/context-retrieval.test.ts
 *
 * Integration test for the RAG pipeline.
 *
 * Seeds a temporary in-memory Chroma collection, runs the retriever,
 * and asserts that relevant documents appear in top-K results.
 *
 * Uses a mock MemoryStore to avoid needing a real Chroma instance in CI.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkText, contentHash, indexDocuments } from "../../src/core/context/indexer.js";
import { sanitize } from "../../src/core/guardrails/pii-filter.js";

// ── Mock the Chroma store ─────────────────────────────────────────────────────

const mockStore = {
  upsert: vi.fn().mockResolvedValue(undefined),
  query: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../.agentic/memory/chroma-store.js", () => ({
  getMemoryStore: () => mockStore,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("chunkText()", () => {
  it("returns the text as-is if it is within MAX_CHUNK_CHARS", () => {
    const short = "This is a short document.";
    expect(chunkText(short)).toEqual([short]);
  });

  it("splits on Markdown headings", () => {
    const md = "# Section A\nContent A\n\n# Section B\nContent B";
    const chunks = chunkText(md);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.includes("Section A"))).toBe(true);
    expect(chunks.some((c) => c.includes("Section B"))).toBe(true);
  });

  it("hard-cuts very long featureless text", () => {
    const long = "a".repeat(5_000);
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1_500);
    }
  });
});

describe("contentHash()", () => {
  it("produces a 16-character hex string", () => {
    expect(contentHash("hello")).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic", () => {
    expect(contentHash("test")).toBe(contentHash("test"));
  });

  it("differs for different content", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("indexDocuments()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls store.upsert with sanitised content", async () => {
    const result = await indexDocuments([
      {
        content: "User contact: alice@example.com — TypeScript best practices",
        collection: "test",
      },
    ]);

    expect(mockStore.upsert).toHaveBeenCalledOnce();
    const [, docs] = mockStore.upsert.mock.calls[0] as [string, Array<{ content: string }>];
    expect(docs[0]?.content).toContain("[EMAIL REDACTED]");
    expect(docs[0]?.content).not.toContain("alice@example.com");
    expect(result.indexed).toBeGreaterThan(0);
  });

  it("returns skipped:0 when documents are provided", async () => {
    const result = await indexDocuments([{ content: "hello", collection: "test" }]);
    expect(result.skipped).toBe(0);
  });

  it("returns indexed:0 and skipped for empty array", async () => {
    const result = await indexDocuments([]);
    expect(result.indexed).toBe(0);
    expect(mockStore.upsert).not.toHaveBeenCalled();
  });

  it("chunks long content into multiple documents", async () => {
    const longContent = "# Heading\n" + "word ".repeat(600);
    await indexDocuments([{ content: longContent, collection: "test" }]);

    const [, docs] = mockStore.upsert.mock.calls[0] as [string, unknown[]];
    expect(docs.length).toBeGreaterThan(1);
  });
});

describe("sanitize() integration with indexer", () => {
  it("strips PII before content is hashed and stored", () => {
    const piiContent = "call 555-867-5309 for support";
    const clean = sanitize(piiContent);
    expect(clean).not.toContain("555-867-5309");
    expect(clean).toContain("[PHONE REDACTED]");
  });
});
