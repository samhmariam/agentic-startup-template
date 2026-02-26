/**
 * .agentic/roles/vibe-engineer.ts
 *
 * Vibe Engineer — refines the "Experience."
 * Superpower: Human Intuition — polishes agent output to meet the Enterprise Quality bar.
 *
 * Full logic: docs/roles/vibe-engineer.md
 * ↳ Polish checklist, 5% rule, golden example nomination, output format.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { COLLECTIONS } from "../memory/types.js";
import type { RoleConfig } from "./types.js";

/** Load full role logic from the docs/roles/ system-of-record. */
const systemPrompt = readFileSync(
  fileURLToPath(new URL("../../docs/roles/vibe-engineer.md", import.meta.url)),
  "utf-8",
);

export const vibeEngineer: RoleConfig = {
  name: "vibe-engineer",
  displayName: "Vibe Engineer",
  defaultCollection: COLLECTIONS.QUALITY_BAR,
  maxSteps: 3,
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  model: openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o"),
  systemPrompt,
};
