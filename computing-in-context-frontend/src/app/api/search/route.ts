import { NextResponse } from "next/server";
import { searchResources, getAllResources } from "@/utils/mongoService";
import { SearchResult } from "@/app/page";

/**
 * GET route handler to fetch all resources
 * Used to display resources before a search is performed
 */
export async function GET() {
  try {
    const documents = await getAllResources(20); // Limit to 20 resources

    if (!documents || documents.length === 0) {
      return NextResponse.json([]);
    }

    const results: SearchResult[] = documents.map((doc) => ({
      title: doc.title || "Untitled Resource",
      snippet: doc.content || "No content preview available",
      score: 1, // Default score since this is not a search result
      url: doc.url || "#",
      language: doc.language || "Not specified",
      course_level: doc.course_level || "Not specified",
      context: doc.context || "Not specified",
      cs_concepts: doc.cs_concepts || "Not specified",
    }));

    if (process.env.NODE_ENV === "development") {
      console.log(`GET API found ${results.length} resources`);
    }

    return NextResponse.json(results);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Get all resources API error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch resources",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * API route handler for search queries with phrase-awareness
 * Supports both simple queries and those with quoted phrases
 */
export async function POST(request: Request) {
  try {
    // Parse the request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error("Error parsing request body:", error);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const { query, filters = {} } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing query parameter" },
        { status: 400 },
      );
    }

    // Log incoming search request in development
    if (process.env.NODE_ENV === "development") {
      console.log("Search API request:", { query, filters });
    }

    // Pass both query and any filters to our enhanced search function
    const documents = await searchResources(query, filters);

    if (!documents || documents.length === 0) {
      return NextResponse.json([]);
    }

    const results: SearchResult[] = documents.map((doc) => ({
      title: doc.title || "Filler",
      snippet: doc.content || "content",
      score: doc.score || 0,
      url: doc.url || "url",
      language: doc.language || "lang",
      course_level: doc.course_level || "course_level",
      context: doc.context || "context",
      cs_concepts: doc.cs_concepts || "cs_concepts",
    }));

    if (process.env.NODE_ENV === "development") {
      console.log(`Search API found ${results.length} results`);
    }

    return NextResponse.json(results);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Search API error:", error);

    return NextResponse.json(
      {
        error: "Failed to search resources",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
