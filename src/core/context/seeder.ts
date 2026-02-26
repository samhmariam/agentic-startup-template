/**
 * src/core/context/seeder.ts
 *
 * Crawls workspace files and seeds them into ChromaDB.
 * This is the "Context Seeding" step of the Knowledge Flywheel.
 *
 * Run via: pnpm seed
 * Or import and call programmatically in tests.
 */

import { readFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import { glob } from "glob";
import { COLLECTIONS } from "../../../.agentic/memory/types.js";
import { contentHash, indexDocuments } from "./indexer.js";

// ── Seed config ───────────────────────────────────────────────────────────────

interface SeedSource {
  pattern: string;
  collection: string;
  /** 0–10 priority. Higher = retrieved first. Stored as metadata for filtering. */
  priority: number;
}

/**
 * Default seed sources.
 * Ordered from highest to lowest priority so the most important context is indexed first.
 */
const DEFAULT_SOURCES: SeedSource[] = [
  // Schema — highest priority (agents read this to understand data shapes)
  {
    pattern: "docs/schema/**/*.{ts,md}",
    collection: COLLECTIONS.SCHEMA,
    priority: 10,
  },
  // Golden examples — the Ground Truth Library
  {
    pattern: "docs/golden-examples/**/*.{ts,md}",
    collection: COLLECTIONS.CODE,
    priority: 9,
  },
  // Architecture decisions
  {
    pattern: "docs/decisions/**/*.md",
    collection: COLLECTIONS.PLANS,
    priority: 8,
  },
  // Quality bar (Vibe Engineer's rubric)
  {
    pattern: "docs/architecture/quality-bar.md",
    collection: COLLECTIONS.QUALITY_BAR,
    priority: 8,
  },
  // General architecture docs
  {
    pattern: "docs/architecture/**/*.md",
    collection: COLLECTIONS.DEFAULT,
    priority: 6,
  },
  // Role full-logic docs (Harness Engineering: system-of-record for all role prompts)
  {
    pattern: "docs/roles/**/*.md",
    collection: COLLECTIONS.DEFAULT,
    priority: 7,
  },
  // Role stub definitions (agents can look up how other roles work)
  {
    pattern: ".agentic/roles/**/*.ts",
    collection: COLLECTIONS.DEFAULT,
    priority: 5,
  },
];

// ── Seeder ────────────────────────────────────────────────────────────────────

export interface SeedResult {
  totalFiles: number;
  totalDocuments: number;
  byCollection: Record<string, number>;
  durationMs: number;
}

/**
 * Seed the ChromaDB knowledge base from workspace files.
 *
 * @param sources - Override default seed sources (useful for testing).
 * @param root - Workspace root (defaults to process.cwd()).
 */
export async function seedContext(
  sources: SeedSource[] = DEFAULT_SOURCES,
  root = process.cwd(),
): Promise<SeedResult> {
  const start = Date.now();
  const byCollection: Record<string, number> = {};
  let totalFiles = 0;
  let totalDocuments = 0;

  for (const source of sources) {
    const files = await glob(source.pattern, { cwd: root, absolute: true });

    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const relativePath = relative(root, file);
      const ext = extname(file).slice(1);
      const name = basename(file);

      const result = await indexDocuments([
        {
          id: `file:${contentHash(relativePath)}`,
          content,
          collection: source.collection,
          metadata: {
            source: relativePath,
            filename: name,
            extension: ext,
            priority: source.priority,
          },
        },
      ]);

      totalFiles++;
      totalDocuments += result.indexed;
      byCollection[source.collection] = (byCollection[source.collection] ?? 0) + result.indexed;

      console.log(`[seed] ${relativePath} → ${source.collection} (${result.indexed} chunks)`);
    }
  }

  return {
    totalFiles,
    totalDocuments,
    byCollection,
    durationMs: Date.now() - start,
  };
}

// ── Seed script entry point ───────────────────────────────────────────────────
// Run directly: npx tsx src/core/context/seeder.ts

const isMain = resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  console.log("[seed] Starting context seed...\n");
  seedContext()
    .then((result) => {
      console.log(`\n[seed] Done in ${result.durationMs}ms`);
      console.log(`  Files:     ${result.totalFiles}`);
      console.log(`  Chunks:    ${result.totalDocuments}`);
      console.log("  By collection:");
      for (const [col, count] of Object.entries(result.byCollection)) {
        console.log(`    ${col}: ${count}`);
      }
    })
    .catch((err: unknown) => {
      console.error("[seed] Failed:", err);
      process.exit(1);
    });
}
