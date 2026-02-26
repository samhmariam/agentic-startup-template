/**
 * .agentic/tools/file-tools.ts
 *
 * Filesystem awareness tools — let agents read workspace files for context.
 *
 * Security note: all paths are resolved relative to the project root
 * and checked against an allowlist to prevent path traversal.
 */

import { tool } from "ai";
import { readFile as fsReadFile, readdir } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { z } from "zod";

// ── Root guard ────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(process.cwd());

/** Throw if the resolved path escapes the project root. */
function safeResolve(relativePath: string): string {
  const resolved = normalize(join(PROJECT_ROOT, relativePath));
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error(
      `Path traversal attempt blocked: "${relativePath}" resolves outside project root.`,
    );
  }
  return resolved;
}

/** Allowlisted directory prefixes agents are permitted to read. */
const READ_ALLOWED_PREFIXES = ["src/", "docs/", ".agentic/", "tests/", "scripts/"];

function assertReadAllowed(relativePath: string): void {
  const normalised = normalize(relativePath).replace(/\\/g, "/");
  const allowed = READ_ALLOWED_PREFIXES.some((p) => normalised.startsWith(p));
  if (!allowed) {
    throw new Error(
      `Read not permitted for "${relativePath}". ` +
        `Allowed prefixes: ${READ_ALLOWED_PREFIXES.join(", ")}`,
    );
  }
}

// ── Tools ─────────────────────────────────────────────────────────────────────

/**
 * Read the full contents of a workspace file.
 * Use this to fetch implementation context before generating related code.
 */
export const readFile = tool({
  description:
    "Read the contents of a file in the workspace. " +
    "Use this to understand existing code before generating new code that interacts with it.",
  parameters: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        "Workspace-relative path to the file (e.g., 'src/core/guardrails/pii-filter.ts').",
      ),
  }),
  execute: async ({ path }) => {
    assertReadAllowed(path);
    const absPath = safeResolve(path);
    const contents = await fsReadFile(absPath, "utf-8");
    return { path, contents, charCount: contents.length };
  },
});

/**
 * List the contents of a directory (non-recursive).
 * Use this to understand directory structure before reading specific files.
 */
export const listDirectory = tool({
  description:
    "List files and subdirectories in a workspace directory (non-recursive). " +
    "Use this to understand project structure or find relevant files.",
  parameters: z.object({
    path: z
      .string()
      .min(1)
      .describe("Workspace-relative directory path (e.g., 'src/core/' or 'docs/')."),
  }),
  execute: async ({ path }) => {
    assertReadAllowed(path);
    const absPath = safeResolve(path);
    const entries = await readdir(absPath, { withFileTypes: true });
    return {
      path,
      entries: entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      })),
    };
  },
});
