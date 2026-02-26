/**
 * tests/unit/pii-filter.test.ts
 *
 * Unit tests for the PII sanitisation module.
 * Fast, deterministic — no API keys, no network, no ChromaDB.
 */

import { describe, expect, it } from "vitest";
import { containsPii, sanitize, sanitizeWithReport } from "../../src/core/guardrails/pii-filter.js";

describe("sanitize()", () => {
  it("redacts email addresses", () => {
    const result = sanitize("Contact alice@example.com for help.");
    expect(result).toBe("Contact [EMAIL REDACTED] for help.");
    expect(result).not.toContain("alice");
  });

  it("redacts US phone numbers", () => {
    const result = sanitize("Call us at (555) 123-4567 today.");
    expect(result).not.toContain("555");
    expect(result).toContain("[PHONE REDACTED]");
  });

  it("redacts SSN formats", () => {
    expect(sanitize("SSN: 123-45-6789")).not.toContain("123-45-6789");
    expect(sanitize("SSN: 123456789")).not.toContain("123456789");
  });

  it("redacts Bearer tokens", () => {
    const result = sanitize("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5");
    expect(result).not.toContain("eyJh");
    expect(result).toContain("[TOKEN REDACTED]");
  });

  it("redacts sk- API keys", () => {
    const result = sanitize("key: sk-abc123defghijklmnop");
    expect(result).not.toContain("sk-abc");
    expect(result).toContain("[TOKEN REDACTED]");
  });

  it("does not alter clean text", () => {
    const clean = "This is a clean document about TypeScript generics.";
    expect(sanitize(clean)).toBe(clean);
  });

  it("handles multiple PII types in one string", () => {
    const dirty = "User alice@test.com, phone: 555-867-5309, SSN: 987-65-4321";
    const result = sanitize(dirty);
    expect(result).not.toContain("alice");
    expect(result).not.toContain("555");
    expect(result).not.toContain("987");
  });
});

describe("sanitizeWithReport()", () => {
  it("reports which PII patterns were found", () => {
    const { redactions } = sanitizeWithReport("email: foo@bar.com, ssn: 111-22-3333");
    const names = redactions.map((r) => r.pattern);
    expect(names).toContain("email");
    expect(names).toContain("ssn");
  });

  it("returns empty redactions for clean text", () => {
    const { redactions } = sanitizeWithReport("Hello world");
    expect(redactions).toHaveLength(0);
  });
});

describe("containsPii()", () => {
  it("returns true when PII is present", () => {
    expect(containsPii("my email is test@example.com")).toBe(true);
  });

  it("returns false when no PII is present", () => {
    expect(containsPii("The sky is blue and TypeScript is great.")).toBe(false);
  });
});
