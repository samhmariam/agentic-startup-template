/**
 * @golden-example
 * @title Perfect AI SDK Tool Definition
 * @nominatedBy agentic-engineer
 * @tags tool-definition, ai-sdk, typescript, zod
 *
 * This is the canonical pattern for defining an AI SDK tool in this codebase.
 * When generating new tools, agents should follow this structure exactly.
 *
 * Key conventions demonstrated:
 *  1. Named export — tools are individually importable and mockable.
 *  2. Description is a verb phrase explaining what the tool does for the agent, not for a human.
 *  3. All parameters are described — the LLM reads these to decide when and how to call.
 *  4. The execute() function returns a plain, serialisable object (never a class instance).
 *  5. Error handling: throw with context, never return an error shape silently.
 *  6. JSDocs on the exported binding, not just the schema.
 */

import { tool } from "ai";
import { z } from "zod";

// ── Schema ─────────────────────────────────────────────────────────────────────

const LookupUserParamsSchema = z.object({
  userId: z.string().describe("The unique identifier of the user to look up."),
  includeProfile: z
    .boolean()
    .default(false)
    .describe("When true, include extended profile fields in the response."),
});

const LookupUserResultSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  profile: z
    .object({
      bio: z.string().optional(),
      avatarUrl: z.string().url().optional(),
    })
    .optional(),
});

// ── Tool ───────────────────────────────────────────────────────────────────────

/**
 * Look up a user by their ID.
 * Returns the user's email, display name, and optionally their extended profile.
 */
export const lookupUserTool = tool({
  description:
    "Look up a user by their unique ID. Use this when you need to resolve a user ID to human-readable details.",
  parameters: LookupUserParamsSchema,
  execute: async ({ userId, includeProfile }) => {
    // In a real implementation this would hit your database or user-service.
    // The important pattern: validate inputs, call dependency, return typed result.
    const user = await fetchUserFromDatabase(userId);

    if (!user) {
      throw new Error(
        `User with ID "${userId}" not found. ` +
          `Ensure the ID is correct or that the user has not been deleted.`,
      );
    }

    const result: z.infer<typeof LookupUserResultSchema> = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };

    if (includeProfile) {
      result.profile = {
        bio: user.bio ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
      };
    }

    return result;
  },
});

// ── Stub (replace with real data layer) ───────────────────────────────────────

async function fetchUserFromDatabase(userId: string) {
  // Replace with real DB/API call.
  return userId === "stub-user-id"
    ? {
        id: "stub-user-id",
        email: "alice@example.com",
        displayName: "Alice",
        bio: null,
        avatarUrl: null,
      }
    : null;
}
