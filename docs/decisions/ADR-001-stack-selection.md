# ADR-001: Stack Selection — TypeScript + Vercel AI SDK + ChromaDB

**Status:** Accepted  
**Date:** 2026-02-26  
**Deciders:** Product Architect, Agentic Engineer, Context Engineer  
**Tags:** infrastructure, stack, agent-framework, vector-store

---

## Context

We are building a repository template ("Pod OS") that a small agentic startup team will clone and extend. It must:

1. Support a five-role "Knowledge Flywheel" lifecycle (plan → execute → audit → polish).
2. Be approachable to new team members on day one (minimal ops ceremony).
3. Be type-safe end-to-end so agent I/O failures surface at compile time, not at 3 AM.
4. Work locally with zero external services required for development and unit/agentic tests.

---

## Decision

**Language:** TypeScript 5.7+ with strict mode and `ESM`/`NodeNext` module resolution.  
**Agent Framework:** Vercel AI SDK (`ai` package) — `generateText`, `streamText`, and the `tool()` helper.  
**Vector Store:** ChromaDB with the embedded JavaScript client (local `__chroma__/` directory by default).  
**Linter/Formatter:** Biome (single binary — replaces ESLint + Prettier).  
**Test Runner:** Vitest (native ESM, fast in-process execution).

---

## Consequences

### Positive
- Full-stack type safety: Zod schemas at `docs/schema/entities.ts` flow into agent I/O, guardrails, and tests.
- Zero-config local dev: Chroma runs embedded — no Docker required for `npm test`.
- Vercel AI SDK is provider-agnostic (OpenAI, Anthropic, Ollama all behind one interface).
- Biome eliminates the ESLint + Prettier version-conflict treadmill.

### Negative
- ChromaDB embedded JS client is less battle-tested than the Python client; may need swapping to a remote Chroma or Qdrant for production deployments with >1M vectors.
- Vercel AI SDK is still pre-1.0 in some areas; API surface can change between minor versions.

### Neutral
- TypeScript adds compile step; `tsx` is used for script execution to avoid a build step in dev.

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| Python + LangGraph | Excellent for production; however TypeScript gives stronger end-to-end type safety between agent I/O and the rest of the stack |
| Python + CrewAI | Role model maps well but Python type safety at agent boundaries is weaker without extra effort |
| Qdrant (instead of Chroma) | Production-grade but requires Docker to run locally, raising the barrier to first `npm test` |
| Pinecone (instead of Chroma) | Managed SaaS — vendor lock-in and requires internet for local dev |
| ESLint + Prettier | Two separate configs, frequent version conflicts — Biome is faster and simpler |

## Agent Impact

- Agents are instructed (via system prompts in `.agentic/roles/`) to generate TypeScript using strict mode conventions.
- The Zod schemas in `docs/schema/entities.ts` are indexed in the `schema` Chroma collection at highest priority — re-seed after any schema change: `npm run seed`.
- The `MockLanguageModelV1` from Vercel AI SDK test utilities is used in `tests/agentic/` so CI runs with zero real API calls.
- This decision does **not** require changes to `docs/schema/entities.ts`.
