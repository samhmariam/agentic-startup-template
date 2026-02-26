/**
 * src/core/index.ts
 *
 * Public barrel export for the Agentic Pod OS core library.
 * Import from here in application code and tests.
 */

// ── Flywheel (main entry point) ───────────────────────────────────────────────
export { runFlywheel, createCliApprovalFn } from "./flywheel.js";
export type { FlywheelOptions } from "./flywheel.js";

// ── Agents ────────────────────────────────────────────────────────────────────
export { planFeature } from "./agents/planner.js";
export { executeSpec } from "./agents/executor.js";
export { auditArtifact } from "./agents/auditor.js";
export { polishOutput } from "./agents/polisher.js";
export { runLogicReview, LogicReviewSchema } from "./agents/logic-critic.js";
export type { LogicReview } from "./agents/logic-critic.js";

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
  parseAgentOutputWithRetry,
  parseTechSpec,
  parseTechSpecWithRetry,
  parseCodeArtifact,
  parseCodeArtifactWithRetry,
  parseAuditReport,
  parseAuditReportWithRetry,
} from "./guardrails/schema-validator.js";
export type { SelfCorrectionOptions } from "./guardrails/schema-validator.js";

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
// ── Observability tools ────────────────────────────────────────────────────────
export { queryLogs, queryMetrics, getStartupSeconds } from "./tools/observability-tools.js";
export type { LogLine, MetricSeries } from "./tools/observability-tools.js";

// ── Memory ───────────────────────────────────────────────────────────────────
export { getMemoryStore, ChromaMemoryStore } from "../../.agentic/memory/chroma-store.js";
export { COLLECTIONS } from "../../.agentic/memory/types.js";
export type {
  MemoryStore,
  MemoryDocument,
  QueryResult,
  CollectionName,
} from "../../.agentic/memory/types.js";
