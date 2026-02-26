/**
 * .agentic/roles/product-architect.ts
 *
 * Product Architect — defines the "What" and "Why."
 * Superpower: Prompt Synthesis — turns vague business goals into high-fidelity TechSpecs.
 *
 * Full logic: docs/roles/product-architect.md
 * ↳ Mission, responsibilities, output format, and Logic Critic mode.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { COLLECTIONS } from "../memory/types.js";
import type { RoleConfig } from "./types.js";

/** Load full role logic from the docs/roles/ system-of-record. */
const systemPrompt = readFileSync(
  fileURLToPath(new URL("../../docs/roles/product-architect.md", import.meta.url)),
  "utf-8",
);

export const productArchitect: RoleConfig = {
  name: "product-architect",
  displayName: "Product Architect",
  defaultCollection: COLLECTIONS.PLANS,
  maxSteps: 3,
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  model: openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o"),
  systemPrompt,
};
