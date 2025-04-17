/**
 * Utility functions for phrase-aware semantic search
 *
 * This module provides functionality to handle quoted phrases in search queries,
 * ensuring they are treated as single semantic units during embedding generation
 * and vector search operations.
 */

/**
 * Parses a search query to extract quoted phrases
 * @param rawQuery The user's raw search query
 * @returns An object with processedQuery and extractedPhrases
 */
export function parseSearchQuery(rawQuery: string): {
  processedQuery: string;
  extractedPhrases: string[];
} {
  if (!rawQuery) {
    return { processedQuery: "", extractedPhrases: [] };
  }

  const extractedPhrases: string[] = [];

  // Regex to match phrases within double quotes, accounting for escaped quotes
  const phraseRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;

  // Replace quoted phrases with placeholder tokens and collect phrases
  const processedQuery = rawQuery.replace(phraseRegex, (match, phrase) => {
    // Extract the phrase without quotes
    const cleanPhrase = phrase.replace(/\\"/g, '"'); // Handle escaped quotes
    extractedPhrases.push(cleanPhrase);

    // Replace with underscore-joined version to preserve as single concept
    return cleanPhrase.replace(/\s+/g, "_");
  });

  return { processedQuery, extractedPhrases };
}

/**
 * Generates enhanced query text that emphasizes phrases
 * This helps the embedding model better understand the importance of phrases
 * @param rawQuery The original user query
 * @returns Enhanced query text with emphasized phrases
 */
export function createEnhancedQueryText(rawQuery: string): string {
  const { processedQuery, extractedPhrases } = parseSearchQuery(rawQuery);

  if (extractedPhrases.length === 0) {
    return rawQuery; // No phrases to emphasize
  }

  // Create an enhanced query that repeats important phrases to increase their weight
  // Format: "original query" + " " + [phrase1] + " " + [phrase2] + ...
  return processedQuery + " " + extractedPhrases.join(" ");
}

/**
 * Logs phrase parsing details for debugging purposes
 * @param rawQuery The original query
 */
export function logQueryParsing(rawQuery: string): void {
  const { processedQuery, extractedPhrases } = parseSearchQuery(rawQuery);
  console.log("Original query:", rawQuery);
  console.log("Processed query:", processedQuery);
  console.log("Extracted phrases:", extractedPhrases);
}
