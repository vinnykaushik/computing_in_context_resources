"use client";

import { useState } from "react";
import "./globals.css";
import ResultCard from "@/components/ResultCard";

export type SearchResult = {
  title: string;
  url: string;
  language: string;
  course_level: string;
  context: string;
  cs_concepts: string;
  snippet: string;
  score: number;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center p-8">
      <h1 className="from-secondary to-tertiary mb-8 bg-gradient-to-r bg-clip-text text-3xl font-bold text-transparent">
        Computing in Context
      </h1>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-8 w-full">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search resources..."
            className="border-primary flex-grow rounded-full border p-2 px-4 font-mono"
          />
          <button
            type="submit"
            className="bg-primary rounded px-4 py-2 text-white hover:opacity-80"
            disabled={isLoading}
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>
      {isLoading && <p>Searching...</p>}
      <div className="w-full">
        {results.length > 0 ? (
          <div className="flex flex-col space-y-4">
            <p className="text-sm text-gray-500">
              {results.length} results found
            </p>
            {results.map((result, index) => (
              <ResultCard
                key={index}
                title={result.title || "FILLER"}
                language={result.language}
                course_level={result.course_level}
                context={result.context}
                cs_concepts={result.cs_concepts}
                confidenceScore={result.score}
                link={result.url}
              />
            ))}
          </div>
        ) : query && !isLoading ? (
          <p className="text-center text-gray-500">No results found</p>
        ) : null}
      </div>
    </main>
  );
}
