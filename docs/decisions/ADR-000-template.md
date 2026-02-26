# ADR-000: Architecture Decision Record Template

**Status:** Template  
**Date:** YYYY-MM-DD  
**Deciders:** [list the Pod roles involved]  
**Tags:** [e.g., infrastructure, agent-design, security]

---

## Context

*Describe the situation, problem, or force that is driving this decision.
What is the technical or business context? What constraints exist?*

## Decision

*State the decision clearly in one sentence, then elaborate.
What did you choose and why?*

## Consequences

### Positive
- *What becomes easier or better as a result?*

### Negative
- *What becomes harder, more expensive, or riskier?*

### Neutral
- *What changes without a clear positive or negative valence?*

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| *Option A* | *Why it lost* |
| *Option B* | *Why it lost* |

## Agent Impact

> **This section is unique to this template.**
> Describe how this decision affects agent behaviour, context quality, or retrieval.

- *How does this change what agents read from the knowledge base?*
- *Does it require a `npm run seed` re-index?*
- *Does it introduce new guardrail requirements?*
- *Does it affect the schema in `docs/schema/entities.ts`?*

---

*Reference: [Documenting Architecture Decisions — Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
