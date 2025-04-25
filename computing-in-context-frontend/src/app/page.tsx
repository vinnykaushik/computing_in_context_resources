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
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero section with updated visuals */}
      <div className="relative overflow-hidden bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-8 py-16">
          <div onClick={resetState} className="cursor-pointer text-center">
            <h1 className="from-secondary to-tertiary bg-gradient-to-r bg-clip-text pb-2 text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              Computing in Context
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Find CS lessons that connect abstract concepts with real-world
              problems
            </p>
          </div>
        </div>
      </div>

      {/* Search section with modern UI */}
      <div className="mx-auto max-w-4xl px-8 py-6">
        <div className="rounded-xl bg-white p-6 shadow-md">
          <form onSubmit={handleSearch} className="mb-4 w-full">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Search resources... (use "quotes" for phrases)'
                    className="w-full rounded-lg border border-gray-200 p-3 pr-10 pl-4 shadow-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="bg-primary hover:bg-opacity-90 flex-none rounded-lg px-5 py-3 font-medium text-white shadow-sm transition focus:ring-2 focus:ring-blue-200 focus:outline-none"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center">
                        <svg
                          className="mr-2 h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Searching</span>
                      </span>
                    ) : (
                      "Search"
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setIsInfoModalOpen(true);
                    }}
                    className="text-secondary ml-2 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 focus:ring-2 focus:ring-gray-200 focus:outline-none"
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
              </div>

              {query && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  Search preview: {highlightPhrases()}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-1 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={showFilters ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
                    />
                  </svg>
                  {showFilters ? "Hide filters" : "Show filters"}
                </button>

                {Object.keys(filters).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters({})}
                    className="mt-2 inline-flex items-center text-sm font-medium text-red-500 hover:text-red-700 sm:mt-0 sm:ml-auto"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-1 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Clear filters
                  </button>
                )}
              </div>

              {showFilters && (
                <div className="mt-2 rounded-lg bg-gray-50 p-5 shadow-inner transition-all duration-200">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                        className="w-full rounded-lg border border-gray-200 p-2 shadow-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
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
                        className="w-full rounded-lg border border-gray-200 p-2 shadow-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
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
                        className="w-full rounded-lg border border-gray-200 p-2 shadow-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                      >
                        <option value="">Any Position</option>
                        <option value="Beginning">Beginning</option>
                        <option value="Middle">Middle</option>
                        <option value="End">End</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Results section */}
        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500"></div>
                <p className="mt-4 text-gray-600">Searching for resources...</p>
              </div>
            </div>
          ) : (
            <div className="w-full">
              {results.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-500">
                      {query
                        ? `${results.length} results found for "${query}"`
                        : `Showing all available resources (${results.length})`}
                    </p>
                    {results.length > 0 && (
                      <p className="text-xs text-gray-400">
                        Sorted by relevance
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {results.map((result, index) => (
                      <div
                        key={index}
                        className="overflow-hidden rounded-xl bg-white shadow-md transition-all duration-200 hover:shadow-lg"
                      >
                        <ResultCard
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
                      </div>
                    ))}
                  </div>
                </div>
              ) : query ? (
                <div className="flex flex-col items-center justify-center rounded-xl bg-white p-12 text-center shadow-md">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-16 w-16 text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-700">
                    No results found
                  </h3>
                  <p className="mt-2 text-gray-500">
                    Try adjusting your search terms or filters
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

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
            integrate computer science concepts with different contexts, making
            learning more engaging and relevant.
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
              <b>Sequence Position:</b> The position of the resource in a course
              (e.g., Beginning, Middle, End).
            </li>
            <li>
              <b>Lesson Context:</b> The context in which the resource is used.
            </li>
            <li>
              <b>Concepts Covered:</b> The computer science concepts covered in
              the resource.
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
              Filter results by programming language, course level, or sequence
              position
            </li>
            <li>
              Browse all resources by using filters without a search query
            </li>
            <li>
              Click on a resource to view more details and access the original
              content
            </li>
            <li>
              Click the Computing in Context logo to reset a search and filters
            </li>
            <li>
              To bring this panel back, click the info button next to the search
              bar at any time
            </li>
          </ul>
        </div>
      </InfoModal>
    </main>
  );
}
