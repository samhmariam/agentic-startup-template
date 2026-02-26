/**
 * scripts/check-layers.ts
 *
 * Architectural Layer Linter (Harness Engineering — Mechanical Taste)
 *
 * Enforces a strict dependency direction across the codebase:
 *
 *   Types → Config → Repo → Service → Runtime → UI
 *
 * Layer alias map (no directory renaming required):
 *
 *   Types   = docs/schema/**
 *   Config  = src/core/guardrails/**
 *   Repo    = src/core/context/**
 *   Service = src/core/agents/**, src/core/tools/**
 *   Runtime = src/core/flywheel.ts, src/core/index.ts
 *   UI      = scripts/**
 *
 * Every violation is emitted as a JSON object with a "fixInstruction" field
 * that can be injected directly into an agent's context window.
 *
 * Usage:
 *   pnpm check:layers
 *
 * Exit code: 0 = no violations, 1 = violations found.
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { glob } from "glob";

// ── Layer definitions ─────────────────────────────────────────────────────────

/** Ordered layer indices — lower = more fundamental, higher = closer to the user. */
const LAYERS = ["Types", "Config", "Repo", "Service", "Runtime", "UI"] as const;
type Layer = (typeof LAYERS)[number];
const LAYER_INDEX: Record<Layer, number> = {
  Types: 0,
  Config: 1,
  Repo: 2,
  Service: 3,
  Runtime: 4,
  UI: 5,
};

/**
 * Pattern matchers for each layer.
 * Patterns are checked in order; first match wins.
 */
const LAYER_PATTERNS: Array<{ layer: Layer; test: (rel: string) => boolean }> = [
  {
    layer: "Types",
    test: (p) => p.startsWith("docs/schema/"),
  },
  {
    layer: "Config",
    test: (p) => p.startsWith("src/core/guardrails/"),
  },
  {
    layer: "Repo",
    test: (p) => p.startsWith("src/core/context/"),
  },
  {
    layer: "Service",
    test: (p) => p.startsWith("src/core/agents/") || p.startsWith("src/core/tools/"),
  },
  {
    layer: "Runtime",
    test: (p) =>
      p === "src/core/flywheel.ts" ||
      p === "src/core/index.ts" ||
      (p.startsWith("src/core/") &&
        !p.includes("/guardrails/") &&
        !p.includes("/context/") &&
        !p.includes("/agents/") &&
        !p.includes("/tools/")),
  },
  {
    layer: "UI",
    test: (p) => p.startsWith("scripts/"),
  },
];

// ── Violation type ────────────────────────────────────────────────────────────

interface LayerViolation {
  file: string;
  importedPath: string;
  fromLayer: Layer;
  toLayer: Layer;
  violation: string;
  fixInstruction: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd());

/** Map a workspace-relative path to its layer, or null if unclassified. */
function classifyPath(rel: string): Layer | null {
  const normalized = rel.replace(/\\/g, "/");
  for (const { layer, test } of LAYER_PATTERNS) {
    if (test(normalized)) return layer;
  }
  return null;
}

/** Extract all relative import/re-export paths from a TypeScript source file. */
function extractImports(source: string): string[] {
  // Match: import ... from "./path" | export ... from "./path" | import("./path")
  const staticRe = /(?:from|export\s+\*\s+from)\s+["'](\.[^"']+)["']/g;
  const dynamicRe = /import\(["'](\.[^"']+)["']\)/g;
  const imports: string[] = [];
  for (const re of [staticRe, dynamicRe]) {
    let m = re.exec(source);
    while (m !== null) {
      if (m[1] !== undefined) imports.push(m[1]);
      m = re.exec(source);
    }
  }
  return imports;
}

/**
 * Resolve an import specifier (may end in .js in NodeNext ESM) to a
 * workspace-relative path with a .ts extension for layer classification.
 */
function resolveImport(fromFile: string, importSpec: string): string {
  const fromDir = resolve(fromFile, "..");
  // Strip .js extension added for ESM compatibility and try .ts
  const stripped = importSpec.replace(/\.js$/, "");
  const abs = resolve(fromDir, stripped);
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  // normalise to .ts for pattern matching (we don't care about actual extension here)
  return rel.endsWith(".ts") ? rel : `${rel}.ts`;
}

/** Build a human-readable, agent-injectable fix instruction for a violation. */
function buildFixInstruction(from: Layer, to: Layer, importedPath: string): string {
  const layerNames = LAYERS.slice(LAYER_INDEX[from] + 1).join(" → ");
  return (
    `Layer violation: ${from} must not depend on ${to}. ` +
    `Valid dependency targets for ${from} are: ${layerNames.length > 0 ? layerNames : "(none — this is the top layer)"}. ` +
    `To fix: (a) move the shared logic into a layer ≤ ${from} and import from there, ` +
    `(b) apply dependency inversion (accept the ${to}-layer concern as a parameter/callback), ` +
    `or (c) if '${importedPath}' is truly a cross-cutting utility, move it to docs/schema/ (Types layer).`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function checkLayers(): Promise<LayerViolation[]> {
  const tsFiles = await glob(["src/**/*.ts", "scripts/**/*.ts", ".agentic/**/*.ts"], {
    cwd: ROOT,
    absolute: true,
    ignore: ["**/*.d.ts", "node_modules/**"],
  });

  const violations: LayerViolation[] = [];

  for (const absFile of tsFiles) {
    const relFile = relative(ROOT, absFile).replace(/\\/g, "/");
    const fromLayer = classifyPath(relFile);
    if (fromLayer === null) continue; // unclassified file — skip

    let source: string;
    try {
      source = readFileSync(absFile, "utf-8");
    } catch {
      continue;
    }

    const imports = extractImports(source);

    for (const imp of imports) {
      const resolvedRel = resolveImport(absFile, imp);
      const toLayer = classifyPath(resolvedRel);
      if (toLayer === null) continue; // external or unclassified import — skip

      const fromIdx = LAYER_INDEX[fromLayer];
      const toIdx = LAYER_INDEX[toLayer];

      // Violation: importing from a HIGHER layer (upward dependency)
      if (toIdx > fromIdx) {
        violations.push({
          file: relFile,
          importedPath: resolvedRel,
          fromLayer,
          toLayer,
          violation: `${fromLayer}→${toLayer}: upward dependency (${fromLayer} may only import from layers ≤ index ${fromIdx})`,
          fixInstruction: buildFixInstruction(fromLayer, toLayer, resolvedRel),
        });
      }
    }
  }

  return violations;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const violations = await checkLayers();

if (violations.length === 0) {
  console.error("[check-layers] ✓ No layer violations found.");
  process.exit(0);
} else {
  // Machine-readable JSON to stdout (for agent consumption)
  process.stdout.write(`${JSON.stringify(violations, null, 2)}\n`);

  // Human-readable summary to stderr
  console.error(`\n[check-layers] ✗ ${violations.length} layer violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    imports: ${v.importedPath}`);
    console.error(`    ${v.violation}`);
    console.error(`    Fix: ${v.fixInstruction}\n`);
  }
  console.error(
    "[check-layers] Pipe stdout to a file to get the machine-readable violation list:\n" +
      "  pnpm check:layers 2>/dev/null | jq .[].fixInstruction",
  );

  process.exit(1);
}
