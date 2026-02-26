/**
 * .agentic/roles/security-lead.ts
 *
 * Security & DX Lead — protects the "Process."
 * Superpower: Automated Guardrails — builds sandboxes and compliance gates that let agents run wild safely.
 *
 * Full logic: docs/roles/security-lead.md
 * ↳ Audit checklist, output format, knowledge-base loop, Perfect Pass criteria.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { COLLECTIONS } from "../memory/types.js";
import type { RoleConfig } from "./types.js";

/** Load full role logic from the docs/roles/ system-of-record. */
const systemPrompt = readFileSync(
  fileURLToPath(new URL("../../docs/roles/security-lead.md", import.meta.url)),
  "utf-8",
);

export const securityLead: RoleConfig = {
  name: "security-lead",
  displayName: "Security & DX Lead",
  defaultCollection: COLLECTIONS.VULNERABILITIES,
  maxSteps: 5,
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  model: openai(process.env["DEFAULT_MODEL"] ?? "gpt-4o"),
  systemPrompt,
};
