/**
 * scripts/seed-context.ts
 *
 * Convenience entry point for seeding the knowledge base.
 * Run: npm run seed
 */

import { seedContext } from "../src/core/context/seeder.js";

console.log("🌱 Seeding knowledge base...\n");

seedContext()
  .then((result) => {
    console.log(`\n✅ Seed complete in ${result.durationMs}ms`);
    console.log(`   Files processed : ${result.totalFiles}`);
    console.log(`   Chunks indexed  : ${result.totalDocuments}`);
    console.log("\n   By collection:");
    for (const [collection, count] of Object.entries(result.byCollection)) {
      console.log(`     ${collection.padEnd(20)} ${count} chunks`);
    }
    console.log("\n💡 Run 'npm run evals' to verify retrieval quality.");
  })
  .catch((error: unknown) => {
    console.error("\n❌ Seed failed:", error);
    console.error("\nHint: Did you set OPENAI_API_KEY in .env?");
    process.exit(1);
  });
