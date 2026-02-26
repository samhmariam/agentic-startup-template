/**
 * .agentic/roles/agentic-engineer.ts
 *
 * Agentic Engineer — executes the "How" via AI.
 * Superpower: Orchestration — manages multi-agent workflows and debugs agent-generated logic.
 *
 * Full logic: docs/roles/agentic-engineer.md
 * ↳ Code standards, output format, what NOT to do.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { COLLECTIONS } from "../memory/types.js";
import type { RoleConfig } from "./types.js";

/** Load full role logic from the docs/roles/ system-of-record. */
const systemPrompt = readFileSync(
  fileURLToPath(new URL("../../docs/roles/agentic-engineer.md", import.meta.url)),
  "utf-8",
);

export const agenticEngineer: RoleConfig = {
  name: "agentic-engineer",
  displayName: "Agentic Engineer",
  defaultCollection: COLLECTIONS.CODE,
  maxSteps: 8,
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  model: openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o"),
  systemPrompt,
};
