# Agentic Pod OS

> The Operating System for your Agentic Pod.
> Clone it, seed it, and let the Knowledge Flywheel spin.

---

## What Is This?

This repository is a production-ready template that encodes a five-role **Knowledge Flywheel** as first-class software architecture. It is not a tutorial — it is a living skeleton that a team can clone and extend to ship enterprise-ready products with AI agents from day one.

Every commit makes your agents measurably smarter.

---

## The Five Roles

| Role | Mission | Owns |
|------|---------|------|
| **Product Architect** | Defines *What* and *Why* | `.agentic/roles/product-architect.ts`, `docs/decisions/` |
| **Agentic Engineer** | Executes *How* via AI | `src/core/agents/`, `src/core/flywheel.ts` |
| **Context Engineer** | Manages *Memory* | `src/core/context/`, `.agentic/memory/`, `docs/schema/` |
| **Security & DX Lead** | Protects *Process* | `src/core/guardrails/`, `.github/workflows/` |
| **Vibe Engineer** | Refines *Experience* | `docs/golden-examples/`, `docs/architecture/quality-bar.md` |

---

## Prerequisites

- Node.js ≥ 20
- An `OPENAI_API_KEY` (for embeddings and LLM calls)

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/agentic-startup-template.git
cd agentic-startup-template

# 2. Install
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 4. Seed the knowledge base (Context Bootstrap)
pnpm seed

# 5. Run the flywheel
pnpm flywheel "Add a user authentication endpoint with JWT"

# 6. Run tests (no API key required)
pnpm test
```

---

## Context Bootstrap Guide

This is the first thing the **Context Engineer** does on a new project. It seeds the Knowledge Base so every agent starts with maximum context.

### Step 1 — Understand the collections

| Collection | Content | Priority |
|------------|---------|----------|
| `schema` | `docs/schema/entities.ts` + schema docs | 10 (highest) |
| `code` | Golden examples (`docs/golden-examples/`) | 9 |
| `plans` | ADRs (`docs/decisions/`) | 8 |
| `quality-bar` | `docs/architecture/quality-bar.md` | 8 |
| `default` | General architecture docs | 6 |
| `vulnerabilities` | Persisted security findings (written by auditor) | — |

### Step 2 — Seed the knowledge base

```bash
pnpm seed
```

This crawls the `docs/` directory and indexes everything into ChromaDB. Run it:
- Once at repo setup
- After any change to `docs/schema/entities.ts`
- After adding a new Golden Example
- After writing a new ADR

### Step 3 — Verify retrieval quality

```bash
OPENAI_API_KEY=... pnpm evals
```

Evals run two suites:
1. **Context Retrieval** — precision@5 for key queries against the knowledge base
2. **Agent Output Quality** — LLM-as-judge scoring of Planning Agent output

A score below `MIN_EVAL_SCORE` (default: 0.70) fails CI.

### Step 4 — Nominate Golden Examples

When the team ships something excellent, nominate it:
1. Copy the file to `docs/golden-examples/`
2. Add the `@golden-example` header comment (see `docs/golden-examples/tool-definition.ts` for format)
3. Run `pnpm seed`
4. Open a PR with title `[golden] Description`

These examples become the highest-priority context for every future agent run.

---

## Running the Flywheel

```bash
# Full flywheel (all 5 stages)
pnpm flywheel "Add a rate-limiting middleware that caps 100 req/min per IP"

# Individual agents (for debugging a stage)
pnpm exec tsx -e "import('./src/core/agents/planner.ts').then(m => m.planFeature('Add login'))"
```

### Flywheel Stages

```
📚 Stage 1 — Context Seeding     (Context Engineer)
📐 Stage 2 — Strategic Planning   (Product Architect)
⚙️  Stage 3 — Agentic Execution    (Agentic Engineer)
🔒 Stage 4 — Security Verification (Security Lead)
✨ Stage 5 — Human Polish          (Vibe Engineer)
     ↓
  Knowledge Base updated → flywheel spins faster next time
```

---

## Development

```bash
pnpm typecheck       # TypeScript type checking
pnpm lint            # Biome linting
pnpm lint:fix        # Auto-fix lint issues
pnpm test:unit       # Fast unit tests (no API key)
pnpm test:agentic    # Agentic integration tests (no API key — uses mock LLM)
pnpm test            # All tests
```

---

## Architecture

See [docs/architecture/overview.md](docs/architecture/overview.md) for the full system diagram and design principles.

See [docs/architecture/flywheel.md](docs/architecture/flywheel.md) for the Knowledge Flywheel sequence diagram.

---

## Adding Architecture Decisions

Use the ADR template in [docs/decisions/ADR-000-template.md](docs/decisions/ADR-000-template.md).

Every ADR has an **Agent Impact** section — fill it in even for non-agent decisions. It answers:
> *How does this decision affect what agents see in their context?*

After writing an ADR, run `pnpm seed` to index it.

---

## CI/CD

Three GitHub Actions workflows:

| Workflow | Trigger | What it checks |
|----------|---------|----------------|
| `ci.yml` | Every PR | Type-check, lint, unit + agentic tests |
| `evals.yml` | PR to `main` | Retrieval precision, agent output quality |
| `security-audit.yml` | Push/PR to `main` | Dependency audit + agentic code audit on changed files |

Set `OPENAI_API_KEY` as a repository secret for the evals and security-audit workflows.

---

## Extending the Template

### Add a new agent role

1. Create `.agentic/roles/my-role.ts` following the `RoleConfig` interface.
2. Add a tool bundle to `.agentic/tools/index.ts`.
3. Create `src/core/agents/my-agent.ts` following the pattern in `docs/golden-examples/agent-function.ts`.
4. Wire it into `src/core/flywheel.ts` as a new stage.
5. Add a unit test in `tests/unit/` and an integration test in `tests/agentic/`.

### Swap the vector store

The `MemoryStore` interface in `.agentic/memory/types.ts` is the only contract. Implement it for Qdrant, Pinecone, or Weaviate and swap the import in `chroma-store.ts`. Zero other changes needed.

### Change the LLM provider

Each role config takes a `model: LanguageModelV1`. Swap `openai(...)` for `anthropic(...)` or any other Vercel AI SDK provider per-role. The rest of the system is provider-agnostic.

---

## License

MIT
