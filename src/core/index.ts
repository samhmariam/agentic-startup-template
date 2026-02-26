/**
 * src/core/index.ts
 *
 * Public barrel export for the Agentic Pod OS core library.
 * Import from here in application code and tests.
 */

// ── Flywheel (main entry point) ───────────────────────────────────────────────
export { runFlywheel } from "./flywheel.js";
export type { FlywheelOptions } from "./flywheel.js";

// ── Agents ────────────────────────────────────────────────────────────────────
export { planFeature } from "./agents/planner.js";
export { executeSpec } from "./agents/executor.js";
export { auditArtifact } from "./agents/auditor.js";
export { polishOutput } from "./agents/polisher.js";

// ── Context (RAG) ─────────────────────────────────────────────────────────────
export { seedContext } from "./context/seeder.js";
export { indexDocuments, chunkText, contentHash } from "./context/indexer.js";
export { retrieve, retrieveMulti, formatAsContext } from "./context/retriever.js";
export type { IndexInput, IndexResult } from "./context/indexer.js";
export type { RetrieveOptions } from "./context/retriever.js";

// ── Guardrails ────────────────────────────────────────────────────────────────
export { sanitize, sanitizeWithReport, containsPii, PATTERNS } from "./guardrails/pii-filter.js";
export {
  parseAgentOutput,
  parseTechSpec,
  parseCodeArtifact,
  parseAuditReport,
} from "./guardrails/schema-validator.js";

// ── Entities (re-exported from docs/schema for convenience) ──────────────────
export type {
  Document,
  GoldenExample,
  TechSpec,
  CodeArtifact,
  AuditReport,
  AuditFinding,
  PolishedArtifact,
  FlywheelResult,
  Severity,
} from "../../docs/schema/entities.js";
export {
  DocumentSchema,
  GoldenExampleSchema,
  TechSpecSchema,
  CodeArtifactSchema,
  AuditFindingSchema,
  AuditReportSchema,
  FlywheelResultSchema,
} from "../../docs/schema/entities.js";

// ── Memory ────────────────────────────────────────────────────────────────────
export { getMemoryStore, ChromaMemoryStore } from "../../.agentic/memory/chroma-store.js";
export { COLLECTIONS } from "../../.agentic/memory/types.js";
export type { MemoryStore, MemoryDocument, QueryResult, CollectionName } from "../../.agentic/memory/types.js";
