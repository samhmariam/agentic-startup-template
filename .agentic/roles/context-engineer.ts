/**
 * .agentic/roles/context-engineer.ts
 *
 * Context Engineer — manages the "Memory."
 * Superpower: Semantic Indexing — ensures code, docs, and data are structured for AI retrieval.
 *
 * Full logic: docs/roles/context-engineer.md
 * ↳ Ground Truth Library, Privacy-Aware RAG, Commit-First Invariant (Harness Engineering).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { COLLECTIONS } from "../memory/types.js";
import type { RoleConfig } from "./types.js";

/** Load full role logic from the docs/roles/ system-of-record. */
const systemPrompt = readFileSync(
  fileURLToPath(new URL("../../docs/roles/context-engineer.md", import.meta.url)),
  "utf-8",
);

export const contextEngineer: RoleConfig = {
  name: "context-engineer",
  displayName: "Context Engineer",
  defaultCollection: COLLECTIONS.SCHEMA,
  maxSteps: 5,
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  model: openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o-mini"),
  systemPrompt,
};
