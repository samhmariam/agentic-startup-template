# Schema — Agent's Map

`entities.ts` is the **single source of truth** for every data shape that flows through the Knowledge Flywheel.

Both the runtime application *and* the agents depend on it:

- **Runtime**: `guardrails/schema-validator.ts` parses all agent I/O through these Zod schemas at runtime.
- **Agents**: The Context Engineer seeds this file into Chroma with the highest priority weight, so agents see the canonical types when generating code.

---

## Schema Evolution Protocol

| Step | Action |
|------|--------|
| **1. Add** | New fields start as `.optional()` — never a breaking change |
| **2. Deprecate** | Mark old fields with a JSDoc `@deprecated` comment; keep them optional |
| **3. Remove** | Only after all callsites are migrated; requires an ADR |
| **4. Rename** | Add the new name `.optional()`, migrate callsites, then remove old name (two PRs) |
| **5. Re-index** | After every change, run `pnpm seed` so the Agent's Map stays current |

> **Why this matters**: if the schema drifts from what agents have indexed, code-gen breaks silently. The `pnpm seed` step closes this loop.

---

## Collections

Each Chroma collection holds a different class of knowledge:

| Collection | Owner Role | Contents |
|------------|-----------|----------|
| `plans` | Product Architect | TechSpecs, ADRs, RFCs |
| `code` | Agentic Engineer | Golden code examples, generated artifacts |
| `vulnerabilities` | Security Lead | Audit findings (used to prevent repeat mistakes) |
| `quality-bar` | Vibe Engineer | UX rubrics, polish examples |
| `schema` | Context Engineer | This file + all schema docs (highest RAG priority) |
| `default` | All | General docs, architecture overviews |
