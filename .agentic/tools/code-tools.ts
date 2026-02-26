/**
 * .agentic/tools/code-tools.ts
 *
 * Code verification tools — let the Agentic Engineer self-verify generated output.
 * These tools run real TypeScript and Biome checks so agents get honest feedback
 * before declaring their work done.
 */

import { tool } from "ai";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execAsync = promisify(exec);

// ── Shared runner ─────────────────────────────────────────────────────────────

async function runCommand(
  command: string,
  timeoutMs = 30_000,
): Promise<{ success: boolean; output: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      encoding: "utf-8",
    });
    return { success: true, output: (stdout + stderr).trim(), exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    const output = ((e.stdout ?? "") + (e.stderr ?? "")).trim();
    return { success: false, output, exitCode: e.code ?? 1 };
  }
}

// ── Tools ─────────────────────────────────────────────────────────────────────

/**
 * Run TypeScript type-checking across the workspace.
 * Call this after generating or modifying any .ts file.
 */
export const runTypeCheck = tool({
  description:
    "Run TypeScript type-checking (tsc --noEmit) across the entire workspace. " +
    "Always call this after generating TypeScript code to verify correctness. " +
    "Fix any reported errors before declaring the task done.",
  parameters: z.object({
    _unused: z.undefined().optional().describe("No parameters needed."),
  }),
  execute: async () => {
    return runCommand("npx tsc --noEmit");
  },
});

/**
 * Run Biome linting across the workspace.
 * Call this after generating code to catch style and correctness violations.
 */
export const runLint = tool({
  description:
    "Run Biome linting to check for code style violations, unused imports, and common errors. " +
    "Call this after runTypeCheck. Fix reported issues before declaring the task done.",
  parameters: z.object({
    _unused: z.undefined().optional().describe("No parameters needed."),
  }),
  execute: async () => {
    return runCommand("npx biome check .");
  },
});

/**
 * Run the unit test suite.
 * Call this to verify your implementation against existing tests.
 */
export const runUnitTests = tool({
  description:
    "Run the unit test suite (tests/unit/). " +
    "Use this to verify that your changes do not break existing tests. " +
    "If tests fail, read the error output and fix before proceeding.",
  parameters: z.object({
    _unused: z.undefined().optional().describe("No parameters needed."),
  }),
  execute: async () => {
    return runCommand("npx vitest run tests/unit", 60_000);
  },
});
