/**
 * .agentic/roles/types.ts
 *
 * Shared types for Pod role configuration.
 */

import type { LanguageModelV1 } from "ai";
import type { CollectionName } from "../memory/types.js";

export interface RoleConfig {
  /** Unique role identifier matching the Pod role names */
  name:
    | "product-architect"
    | "agentic-engineer"
    | "context-engineer"
    | "security-lead"
    | "vibe-engineer";
  /** Human-readable display name */
  displayName: string;
  /** The system prompt injected on every call using this role */
  systemPrompt: string;
  /** Language model to use for this role (overrides DEFAULT_MODEL) */
  model: LanguageModelV1;
  /**
   * The primary Chroma collection this role reads from.
   * The agent can still query other collections explicitly.
   */
  defaultCollection: CollectionName;
  /** Maximum agent loop steps before forcing termination */
  maxSteps?: number;
}
