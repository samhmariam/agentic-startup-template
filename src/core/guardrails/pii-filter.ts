/**
 * src/core/guardrails/pii-filter.ts
 *
 * PII sanitisation middleware.
 * Called by the indexer before any text enters the vector store
 * and by the retriever before any chunk is injected into agent context.
 *
 * "Privacy-Aware RAG" — a core responsibility of the Context Engineer.
 *
 * Pattern coverage:
 *   - Email addresses
 *   - US Social Security Numbers (SSN)
 *   - Credit / debit card numbers (major formats)
 *   - US phone numbers (various formats)
 *   - IPv4 addresses
 *   - US ZIP codes (when adjacent to a named "zip" label)
 *   - Bearer / API tokens (common prefixes)
 *
 * Extend PATTERNS below to cover your domain-specific PII.
 */

// ── Patterns ──────────────────────────────────────────────────────────────────

interface PiiPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

export const PATTERNS: PiiPattern[] = [
  {
    name: "email",
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL REDACTED]",
  },
  {
    name: "ssn",
    regex: /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/g,
    replacement: "[SSN REDACTED]",
  },
  {
    name: "credit-card",
    // Matches 13-19 digit sequences with optional spaces/dashes (Luhn not validated)
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[CARD REDACTED]",
  },
  {
    name: "phone-us",
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE REDACTED]",
  },
  {
    name: "ipv4",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[IP REDACTED]",
  },
  {
    name: "bearer-token",
    // Matches common secret prefixes followed by token-like strings
    regex: /\b(?:Bearer|sk-|pk-|ghp_|xoxb-|xoxp-|eyJ)[A-Za-z0-9\-_.~+/]{8,}\b/g,
    replacement: "[TOKEN REDACTED]",
  },
];

// ── Sanitise ──────────────────────────────────────────────────────────────────

export interface SanitiseResult {
  sanitised: string;
  redactions: Array<{ pattern: string; count: number }>;
}

/**
 * Sanitise a string by replacing all detected PII with redaction placeholders.
 * Returns the sanitised text and a list of what was redacted (no original values).
 */
export function sanitizeWithReport(text: string): SanitiseResult {
  let sanitised = text;
  const redactions: Array<{ pattern: string; count: number }> = [];

  for (const { name, regex, replacement } of PATTERNS) {
    let count = 0;
    sanitised = sanitised.replace(regex, () => {
      count++;
      return replacement;
    });
    if (count > 0) {
      redactions.push({ pattern: name, count });
    }
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
  }

  return { sanitised, redactions };
}

/**
 * Sanitise text of PII — the fast path for use in the indexer and retriever.
 * If you need to audit what was redacted, use `sanitizeWithReport` instead.
 */
export function sanitize(text: string): string {
  return sanitizeWithReport(text).sanitised;
}

/**
 * Returns true if the text contains any detectable PII.
 * Use this as a pre-flight check before logging or persisting agent output.
 */
export function containsPii(text: string): boolean {
  return PATTERNS.some((p) => {
    const found = p.regex.test(text);
    p.regex.lastIndex = 0;
    return found;
  });
}
