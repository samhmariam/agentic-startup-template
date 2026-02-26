/**
 * .agentic/tools/index.ts
 *
 * Central tool registry — export all tools from one place.
 *
 * Usage in an agent:
 *   import { allTools, executorTools } from "../tools/index.js";
 *   const { text } = await generateText({ tools: executorTools, ... });
 */

export { searchKnowledgeBase, searchVulnerabilities, writeVulnerability } from "./search-tools.js";
export { readFile, listDirectory } from "./file-tools.js";
export { runTypeCheck, runLint, runUnitTests } from "./code-tools.js";
export { queryLogs, queryMetrics } from "../../src/core/tools/observability-tools.js";

// ── Role-scoped tool bundles ──────────────────────────────────────────────────
// Each agent imports only the tools relevant to its role.
// This reduces the LLM's decision surface and token usage.

import { queryLogs, queryMetrics } from "../../src/core/tools/observability-tools.js";
import { runLint, runTypeCheck, runUnitTests } from "./code-tools.js";
import { listDirectory, readFile } from "./file-tools.js";
import { searchKnowledgeBase, searchVulnerabilities, writeVulnerability } from "./search-tools.js";

/** Tools available to the Product Architect (planning agent) */
export const plannerTools = {
  searchKnowledgeBase,
  readFile,
  listDirectory,
} as const;

/** Observability tools — verify runtime behaviour after shipping a change */
export const observabilityTools = {
  queryLogs,
  queryMetrics,
} as const;

/** Tools available to the Agentic Engineer (executor agent) */
export const executorTools = {
  searchKnowledgeBase,
  readFile,
  listDirectory,
  runTypeCheck,
  runLint,
  runUnitTests,
  queryLogs,
  queryMetrics,
} as const;

/** Tools available to the Security Lead (auditor agent) */
export const auditorTools = {
  searchKnowledgeBase,
  searchVulnerabilities,
  writeVulnerability,
  readFile,
} as const;

/** Tools available to the Vibe Engineer (polisher agent) */
export const polisherTools = {
  searchKnowledgeBase,
  readFile,
} as const;

/** All tools — use only for debugging or meta-agents */
export const allTools = {
  searchKnowledgeBase,
  searchVulnerabilities,
  writeVulnerability,
  readFile,
  listDirectory,
  runTypeCheck,
  runLint,
  runUnitTests,
  queryLogs,
  queryMetrics,
} as const;
