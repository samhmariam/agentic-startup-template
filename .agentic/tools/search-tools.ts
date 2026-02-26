/**
 * .agentic/tools/search-tools.ts
 *
 * Semantic search tools — the primary way agents retrieve context from ChromaDB.
 */

import { tool } from "ai";
import { z } from "zod";
import { getMemoryStore } from "../memory/chroma-store.js";
import { COLLECTIONS } from "../memory/types.js";

const collectionEnum = z
  .enum([
    COLLECTIONS.PLANS,
    COLLECTIONS.CODE,
    COLLECTIONS.VULNERABILITIES,
    COLLECTIONS.QUALITY_BAR,
    COLLECTIONS.SCHEMA,
    COLLECTIONS.DEFAULT,
  ])
  .describe("The knowledge base partition to search.");

/**
 * Semantic search over the knowledge base.
 * Use this whenever you need context, examples, prior decisions, or past findings.
 */
export const searchKnowledgeBase = tool({
  description:
    "Semantically search the knowledge base for relevant documents. " +
    "Use this before generating any code, spec, or audit to ground your response in prior context.",
  parameters: z.object({
    query: z.string().min(3).describe("Natural-language search query."),
    collection: collectionEnum
      .default(COLLECTIONS.DEFAULT)
      .describe("Which collection to search. Defaults to 'default'."),
    topK: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Number of results to return (1–20). Default: 5."),
  }),
  execute: async ({ query, collection, topK }) => {
    const store = getMemoryStore();
    const results = await store.query(collection, query, topK);

    return results.map((r) => ({
      id: r.id,
      score: Number(r.score.toFixed(4)),
      content: r.content,
      metadata: r.metadata,
    }));
  },
});

/**
 * Look up past security findings to avoid repeating known vulnerabilities.
 * Used exclusively by the Security Lead role.
 */
export const searchVulnerabilities = tool({
  description:
    "Retrieve past security findings from the vulnerabilities collection. " +
    "Use this at the start of every audit to check for patterns we have seen before.",
  parameters: z.object({
    query: z
      .string()
      .min(3)
      .describe("Describe the code pattern or vulnerability type to look up."),
    topK: z.number().int().min(1).max(10).default(5),
  }),
  execute: async ({ query, topK }) => {
    const store = getMemoryStore();
    return store.query(COLLECTIONS.VULNERABILITIES, query, topK);
  },
});

/**
 * Write a new security finding to the vulnerabilities collection.
 * Called by the Security Lead after producing an AuditReport.
 */
export const writeVulnerability = tool({
  description:
    "Persist a security finding to the vulnerabilities knowledge base " +
    "so future agents can avoid repeating the same mistake. " +
    "Call this for every 'critical' or 'high' severity finding.",
  parameters: z.object({
    id: z.string().min(1).describe("Unique ID for this finding (e.g., SHA of description)."),
    category: z.string().describe("Vulnerability category (e.g., 'SQL Injection', 'PII Leak')."),
    description: z.string().describe("Detailed description of the vulnerability."),
    location: z.string().optional().describe("File path and line range, if known."),
    suggestion: z.string().optional().describe("How to fix or prevent this vulnerability."),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
  }),
  execute: async ({ id, category, description, location, suggestion, severity }) => {
    const store = getMemoryStore();
    const content = [
      `Category: ${category}`,
      `Severity: ${severity}`,
      `Description: ${description}`,
      location ? `Location: ${location}` : null,
      suggestion ? `Suggestion: ${suggestion}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await store.upsert(COLLECTIONS.VULNERABILITIES, [
      {
        id,
        content,
        metadata: { category, severity, indexedAt: new Date().toISOString() },
      },
    ]);

    return { success: true, id };
  },
});
