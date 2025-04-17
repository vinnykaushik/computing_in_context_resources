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

// Available filter options
export type SearchFilters = {
  language?: string;
  course_level?: string;
  sequence_position?: string;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsLoading(true);
    setResults([]); // Clear previous results

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, filters }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Search response error:", response.status, errorData);
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Search error:", error);
      // Display error message to user
      alert(
        `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Function to highlight quoted phrases in the query
  const highlightPhrases = () => {
    if (!query) return null;

    const parts = [];
    let lastIndex = 0;
    const regex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    let match;

    while ((match = regex.exec(query)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {query.substring(lastIndex, match.index)}
          </span>,
        );
      }

      // Add the quoted phrase with highlighting
      parts.push(
        <span
          key={`phrase-${match.index}`}
          className="rounded bg-green-100 px-1 text-green-800"
        >
          {match[0]}
        </span>,
      );

      lastIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < query.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>{query.substring(lastIndex)}</span>,
      );
    }

    return parts;
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center p-8">
      <h1 className="from-secondary to-tertiary mb-8 bg-gradient-to-r bg-clip-text text-3xl font-bold text-transparent">
        Computing in Context
      </h1>
      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-4 w-full">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='search resources... (use "quotes" for phrases)'
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

          {query && (
            <div className="px-4 text-sm text-gray-600">
              Search preview: {highlightPhrases()}
            </div>
          )}

          <div className="flex items-center justify-between px-4">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showFilters ? "Hide filters" : "Show filters"}
            </button>

            {Object.keys(filters).length > 0 && (
              <button
                type="button"
                onClick={() => setFilters({})}
                className="text-sm text-red-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-2 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
              {/* Language filter */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Language
                </label>
                <select
                  value={filters.language || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      language: e.target.value || undefined,
                    })
                  }
                  className="w-full rounded border p-2"
                >
                  <option value="">Any language</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="java">Java</option>
                </select>
              </div>

              {/* Course level filter */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Course Level
                </label>
                <select
                  value={filters.course_level || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      course_level: e.target.value || undefined,
                    })
                  }
                  className="w-full rounded border p-2"
                >
                  <option value="">Any level</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              {/* Sequence Position filter */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Sequence Position
                </label>
                <select
                  value={filters.sequence_position || ""}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      sequence_position: e.target.value || undefined,
                    })
                  }
                  className="w-full rounded border p-2"
                >
                  <option value="Beginning">Beginning</option>
                  <option value="Middle">Middle</option>
                  <option value="End">End</option>
                  <option value="">Any Position</option>
                </select>
              </div>
            </div>
          )}
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
