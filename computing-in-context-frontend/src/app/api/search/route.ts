import { NextResponse } from "next/server";
import { searchResources } from "@/utils/mongoService";
import { SearchResult } from "@/app/page";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const documents = await searchResources(query);

    if (!documents) {
      return NextResponse.json([]);
    }
    //console.log("Docs: ", documents);

    const results: SearchResult[] = documents.map((doc) => ({
      title: doc.title || undefined,
      snippet: doc.content || undefined,
      score: doc.score || 0,
    }));
    //console.log("results", results);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Failed to search resources" },
      { status: 500 }
    );
  }
}
