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
 *   - Credit / debit card numbers (Luhn-validated, major formats)
 *   - US phone numbers (various formats)
 *   - IPv4 addresses
 *   - US ZIP codes (when adjacent to a named "zip" / "postal" label)
 *   - Bearer / API tokens (common prefixes)
 *   - IBAN (EU/UK international bank account numbers)
 *   - NHS numbers (UK healthcare)
 *   - US Medicare Beneficiary Identifiers (MBI)
 *   - Passport numbers (when preceded by a context keyword)
 *
 * Extend PATTERNS below to cover your domain-specific PII.
 */

// ── Patterns ──────────────────────────────────────────────────────────────────

interface PiiPattern {
  name: string;
  regex: RegExp;
  replacement: string;
  /**
   * Optional post-match guard — called with the raw matched string.
   * Return `false` to skip redaction for this match (e.g. Luhn check).
   */
  validate?: (match: string) => boolean;
}

// ── Luhn algorithm (O4) ───────────────────────────────────────────────────────

/**
 * Returns true if the digit-only string passes the Luhn check.
 * Used to validate credit-card candidates before redacting.
 */
function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
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
    // Matches 13-19 digit sequences with optional spaces/dashes
    // Guarded by Luhn validation to eliminate false positives (O4)
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[CARD REDACTED]",
    validate: (match) => luhn(match.replace(/[ -]/g, "")),
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
  {
    name: "iban",
    // International Bank Account Number — e.g. GB29 NWBK 6016 1331 9268 19
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})?\b/g,
    replacement: "[IBAN REDACTED]",
  },
  {
    name: "zip-code",
    // US ZIP code — only when labelled (avoids colliding with bare 5-digit numbers)
    regex: /\b(?:zip|postal)[\s:]+\d{5}(?:-\d{4})?\b/gi,
    replacement: "[ZIP REDACTED]",
  },
  {
    name: "nhs-number",
    // UK NHS number — 10 digit groups e.g. 943-476-5919
    regex: /\b\d{3}[ -]\d{3}[ -]\d{4}\b/g,
    replacement: "[NHS REDACTED]",
  },
  {
    name: "medicare-id",
    // US Medicare Beneficiary Identifier (MBI) — 11-char alphanumeric e.g. 1EG4-TE5-MK72
    regex: /\b[1-9][AC-HJ-NP-RT-Y][AC-HJ-NP-RT-Y0-9]\d[AC-HJ-NP-RT-Y][AC-HJ-NP-RT-Y0-9]\d[AC-HJ-NP-RT-Y]{2}\d{2}\b/g,
    replacement: "[MEDICARE REDACTED]",
  },
  {
    name: "passport",
    // Generic passport — only when preceded by context keyword to avoid over-matching
    regex: /\b(?:passport|travel document)[\s:#]*[A-Z]{1,2}\d{6,9}\b/gi,
    replacement: "[PASSPORT REDACTED]",
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

  for (const { name, regex, replacement, validate } of PATTERNS) {
    let count = 0;
    sanitised = sanitised.replace(regex, (match) => {
      if (validate && !validate(match)) return match;
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
