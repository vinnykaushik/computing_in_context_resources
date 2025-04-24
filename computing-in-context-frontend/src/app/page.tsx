"use client";

import { useState, useEffect } from "react";
import "./globals.css";
import ResultCard from "@/components/ResultCard";
import InfoModal from "@/components/InfoModal";

export type SearchResult = {
  title: string;
  url: string;
  language: string;
  course_level: string;
  sequence_position: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(true);

  const resetState = () => {
    setQuery("");
    setResults([]);
    setFilters({});
    setShowFilters(false);
    setIsLoading(true);
  };

  useEffect(() => {
    async function fetchAllResources() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();

        if (filters.language) params.append("language", filters.language);
        if (filters.course_level)
          params.append("course_level", filters.course_level);
        if (filters.sequence_position)
          params.append("sequence_position", filters.sequence_position);

        const url = `/api/search${params.toString() ? `?${params.toString()}` : ""}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch resources with status: ${response.status}`,
          );
        }

        const data = await response.json();
        setResults(data);
      } catch (error) {
        console.error("Error fetching resources:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllResources();
  }, [filters]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsLoading(true);
    setResults([]);

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
      <div onClick={resetState} className="cursor-pointer">
        <h1 className="from-secondary to-tertiary mb-8 bg-gradient-to-r bg-clip-text text-3xl font-bold text-transparent">
          Computing in Context
        </h1>
      </div>
      <p className="text-md mb-4 text-center text-gray-700">
        A tool built for computing science educators to find lessons that deal
        with computing not solely in the abstract, but in the context of
        real-world problems.
      </p>
      <div className="mb-4 flex w-full items-center justify-between">
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
              {/* Move info button here */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setIsInfoModalOpen(true);
                }}
                className="text-secondary bg-primary flex h-10 w-10 items-center justify-center rounded-full hover:opacity-80"
                aria-label="Information"
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
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
                    <option value="CS0">CS0</option>
                    <option value="CS1">CS1</option>
                    <option value="CS2">CS2</option>
                    <option value="CS3">CS3</option>
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

        <InfoModal
          isOpen={isInfoModalOpen}
          onClose={() => setIsInfoModalOpen(false)}
          title="About Computing in Context"
        >
          <div className="space-y-4">
            <p>
              Welcome to Computing in Context, a resource for computer science
              educators looking for contextual examples and teaching materials.
            </p>

            <p>
              This tool helps you find programming examples and resources that
              integrate computer science concepts with different contexts,
              making learning more engaging and relevant.
            </p>

            <h3 className="mt-4 text-lg font-semibold">Fields:</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <b>Language:</b> The programming language used in the resource.
              </li>
              <li>
                <b>Course Level:</b> The course position in the intro sequence.
                (e.g., CS0, CS1, CS2, CS3).
              </li>
              <li>
                <b>Sequence Position:</b> The position of the resource in a
                course (e.g., Beginning, Middle, End).
              </li>
              <li>
                <b>Lesson Context:</b> The context in which the resource is
                used.
              </li>
              <li>
                <b>Concepts Covered:</b> The computer science concepts covered
                in the resource.
              </li>
              <li>
                <b>Confidence Score:</b> A score indicating the relevance of the
                resource to your search query. Higher scores indicate a better
                match.
              </li>
            </ul>

            <h3 className="mt-4 text-lg font-semibold">Search Tips:</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                Use quotation marks for exact phrase searches: &quot;data
                structures&quot;
              </li>
              <li>
                Filter results by programming language, course level, or
                sequence position
              </li>
              <li>
                Browse all resources by using filters without a search query
              </li>
              <li>
                Click on a resource to view more details and access the original
                content
              </li>
              <li>
                Click the Computing in Context logo to reset a search and
                filters
              </li>
              <li>
                To bring this panel back, click the info button next to the
                search bar at any time
              </li>
            </ul>
          </div>
        </InfoModal>
      </div>

      {isLoading && <p>Searching...</p>}
      <div className="w-full">
        {results.length > 0 ? (
          <div className="flex flex-col space-y-4">
            <p className="text-sm text-gray-500">
              {query
                ? `${results.length} results found for "${query}"`
                : `Showing all available resources (${results.length})`}
            </p>
            {results.map((result, index) => (
              <ResultCard
                key={index}
                title={result.title || "FILLER"}
                language={result.language}
                course_level={result.course_level}
                context={result.context}
                sequence_position={result.sequence_position}
                cs_concepts={result.cs_concepts}
                confidenceScore={result.score}
                link={result.url}
                displayConfidenceScore={!!query}
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
