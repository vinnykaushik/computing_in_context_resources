"use client";

import { useState } from "react";
import "./globals.css";

export type SearchResult = {
  title?: string;
  snippet?: string;
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
    <main className="flex min-h-screen flex-col items-center p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-secondary to-tertiary bg-clip-text text-transparent">
        Computing in Context
      </h1>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="w-full mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search resources..."
            className="font-mono flex-grow border-primary border rounded-full p-2 px-4"
          />
          <button
            type="submit"
            className="bg-primary hover:opacity-80 text-white px-4 py-2 rounded"
            disabled={isLoading}
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>
      {isLoading && <p>Searching...</p>}
      <div className="w-full">
        {results.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              {results.length} results found
            </p>
            {results.map((result, index) => (
              <div key={index} className="border rounded-full p-4">
                <h2 className="font-semibold text-lg">
                  {result.title || "Untitled Notebook"}
                </h2>
                <p className="text-sm text-gray-700 mt-1">{"blank for now"}</p>
                <div className="flex gap-2 mt-2">
                  <span className="bg-gray-100 text-xs px-2 py-1 rounded">
                    Score: {Math.round(result.score * 100) / 100}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : query && !isLoading ? (
          <p className="text-center text-gray-500">No results found</p>
        ) : null}
      </div>
    </main>
  );
}
