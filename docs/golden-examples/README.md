# Ground Truth Library — Golden Examples

This directory is the **most important input** to the Context Engineer's RAG pipeline.

Documents here are seeded into Chroma at the **highest priority weight** — when an agent is confused about how to write code, it retrieves from here first.

---

## What Belongs Here

A "Golden Example" is a piece of code or a doc that represents **exactly how this team writes things**.

It answers the question: *"If an agent has seen nothing else, and it sees this, will it produce the right output?"*

### Good candidates
- A perfectly structured AI SDK `tool()` definition
- An exemplary async function with error handling, JSDoc, and a unit test
- A `TechSpec` that led to excellent output
- A PR that the whole team agreed was the gold standard

### Bad candidates
- "Good enough" examples — only perfect examples go here
- Third-party code — we're training on our own patterns
- Drafts or WIPs

---

## How to Nominate a Golden Example

1. Create a `.ts` or `.md` file in this directory.
2. Add a header comment with title, nominator role, and tags (see existing files for format).
3. Run `pnpm seed` to index it into Chroma.
4. Open a PR with the title `[golden] Description of example`.

---

## Current Inventory

| File | Topic | Nominated By |
|------|-------|-------------|
| `tool-definition.ts` | AI SDK tool() pattern | agentic-engineer |
| `agent-function.ts` | Typed agent function pattern | agentic-engineer |
