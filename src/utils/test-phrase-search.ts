/**
 * Test utility for phrase-aware search functionality
 *
 * This script provides testing utilities for the phrase-aware search implementation
 * to verify that quoted phrases are properly handled during embedding generation.
 */
import { createEnhancedQueryText, parseSearchQuery } from "./phraseAwareSearch";
import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

/**
 * Test the phrase parsing functionality with various inputs
 */
export function testParsing() {
  const testQueries = [
    "learning Python",
    'learning "for loops" in Python',
    '"machine learning" vs "deep learning"',
    'using "try except" blocks in Python',
    'complex query with "quoted phrases" and "multiple parts" to process',
  ];

  console.log("=== PHRASE PARSING TESTS ===");
  testQueries.forEach((query) => {
    const result = parseSearchQuery(query);
    console.log("\nOriginal Query:", query);
    console.log("Processed Query:", result.processedQuery);
    console.log("Extracted Phrases:", result.extractedPhrases);
  });
}

/**
 * Test the enhanced query generation for embedding
 */
export function testEnhancedQueries() {
  const testQueries = [
    "learning Python",
    'learning "for loops" in Python',
    '"machine learning" vs "deep learning"',
  ];

  console.log("\n=== ENHANCED QUERY TESTS ===");
  testQueries.forEach((query) => {
    const enhancedQuery = createEnhancedQueryText(query);
    console.log("\nOriginal Query:", query);
    console.log("Enhanced Query:", enhancedQuery);
  });
}

/**
 * Test embedding generation with and without phrase awareness
 */
export async function testEmbeddings() {
  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Test cases comparing regular vs phrase-aware embeddings
  const testCases = [
    {
      label: "Standard query",
      regular: "learning Python",
      phraseAware: "learning Python",
    },
    {
      label: "Query with phrases",
      regular: "learning for loops in Python",
      phraseAware: 'learning "for loops" in Python',
    },
    {
      label: "Technical concepts",
      regular: "conditional statements and logical operators",
      phraseAware: '"conditional statements" and "logical operators"',
    },
  ];

  console.log("\n=== EMBEDDING COMPARISON TESTS ===");

  for (const test of testCases) {
    console.log(`\nTest: ${test.label}`);
    console.log(`Regular query: "${test.regular}"`);
    console.log(`Phrase-aware query: "${test.phraseAware}"`);

    try {
      // Generate regular embedding
      const regularEmbedding = await openaiClient.embeddings.create({
        input: test.regular,
        model: "text-embedding-3-large",
      });

      // Generate phrase-aware embedding
      const enhancedQuery = createEnhancedQueryText(test.phraseAware);
      const phraseAwareEmbedding = await openaiClient.embeddings.create({
        input: enhancedQuery,
        model: "text-embedding-3-large",
      });

      // Calculate cosine similarity between the embeddings
      const similarity = calculateCosineSimilarity(
        regularEmbedding.data[0].embedding,
        phraseAwareEmbedding.data[0].embedding,
      );

      console.log(`Embedding similarity: ${similarity.toFixed(4)}`);
      console.log(`Difference detected: ${similarity < 0.99 ? "YES" : "NO"}`);
    } catch (error) {
      console.error(`Error in embedding test: ${error}`);
    }
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  // Calculate dot product
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);

  // Calculate magnitudes
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  // Calculate cosine similarity
  return dotProduct / (mag1 * mag2);
}

/**
 * Run all tests
 */
export async function runAllTests() {
  console.log("Running phrase-aware search tests...");
  testParsing();
  testEnhancedQueries();
  await testEmbeddings();
  console.log("\nAll tests completed!");
}

// Uncomment to run tests directly
// if (require.main === module) {
//   runAllTests().catch(console.error);
// }
