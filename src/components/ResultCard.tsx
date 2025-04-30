import React, { useState } from "react";
import Link from "next/link";
import toTitleCase from "@/utils/toTitleCase";

type ResultCardProps = {
  title: string;
  author?: string;
  university?: string;
  language: string;
  course_level: string;
  sequence_position: string;
  context: string;
  description: string;
  cs_concepts: string;
  confidenceScore: number;
  link: string;
  displayConfidenceScore?: boolean;
  file_type?: string;
};

const ResultCard: React.FC<ResultCardProps> = ({
  title,
  author,
  university,
  language,
  course_level,
  sequence_position,
  context,
  description,
  cs_concepts,
  confidenceScore,
  link,
  displayConfidenceScore = false,
  file_type,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Format concepts as a comma-separated list
  const formattedConcepts = cs_concepts
    .split(",")
    .map((concept) => concept.trim())
    .join(", ");

  // Get the clean confidence score
  const score = Math.round(confidenceScore * 100) / 100;

  // Get confidence color and width
  const getConfidenceColor = () => {
    if (score >= 0.85) return "bg-green-500";
    if (score >= 0.7) return "bg-blue-500";
    if (score >= 0.5) return "bg-yellow-500";
    return "bg-red-500";
  };

  const confidenceWidth = `${Math.min(100, Math.max(5, score * 100))}%`;

  // Define language-specific styling
  const getLanguageStyle = () => {
    switch (language?.toLowerCase()) {
      case "python":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      case "javascript":
        return "bg-yellow-100 text-yellow-800 border border-yellow-200";
      case "java":
        return "bg-red-100 text-red-800 border border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  // Define file type styling
  const getFileTypeStyle = () => {
    switch (file_type?.toLowerCase()) {
      case "pdf":
        return "bg-red-50 text-red-600 border border-red-100";
      case "notebook":
      case "ipynb":
        return "bg-green-50 text-green-600 border border-green-100";
      case "python":
      case "py":
        return "bg-blue-50 text-blue-600 border border-blue-100";
      case "javascript":
      case "js":
        return "bg-yellow-50 text-yellow-600 border border-yellow-100";
      case "java":
        return "bg-orange-50 text-orange-600 border border-orange-100";
      case "docx":
      case "doc":
        return "bg-indigo-50 text-indigo-600 border border-indigo-100";
      default:
        return "bg-purple-50 text-purple-600 border border-purple-100";
    }
  };

  // Add an additional style to create an ellipsis effect for truncated text
  const getEllipsisStyle = (): React.CSSProperties => {
    if (!isExpanded) {
      return {
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        position: "relative",
      } as React.CSSProperties;
    }
    return {};
  };

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-gray-100 p-6 transition-all duration-500 hover:border-blue-100 hover:shadow-lg"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="to-tertiary from-secondary absolute inset-0 z-0 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>

      <Link
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View resource: ${title}`}
        className="relative"
      >
        <span className="absolute inset-0 z-10" aria-hidden="true"></span>

        {/* Top badges section */}
        <div className="relative z-10 mb-3 flex flex-wrap items-center gap-2">
          <div
            className={`${getLanguageStyle()} rounded-full px-3 py-1 text-xs font-medium`}
          >
            <span className="opacity-70">Language:</span>{" "}
            {toTitleCase(language) || "Unknown"}
          </div>

          {file_type && (
            <div
              className={`${getFileTypeStyle()} rounded-full px-3 py-1 text-xs font-medium`}
            >
              <span className="opacity-70">File Type:</span> .
              {file_type.toLowerCase()}
            </div>
          )}

          <div className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
            <span className="opacity-70">Level:</span>{" "}
            {course_level || "Any level"}
          </div>

          {sequence_position && (
            <div className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
              <span className="opacity-70">Position:</span>{" "}
              {toTitleCase(sequence_position)} of Course
            </div>
          )}
        </div>

        {/* Title */}
        <div className="relative z-10 mb-4">
          <h2 className="group-hover:text-primary inline-block rounded-lg bg-gradient-to-r from-gray-50 to-white px-4 py-2 text-xl leading-tight font-bold text-gray-900 shadow-sm transition-colors duration-200">
            {title}
          </h2>
        </div>

        {/* Author and University information */}
        {(author || university) && (
          <div className="relative z-10 mb-4 flex w-fit items-center rounded-lg bg-gradient-to-r from-gray-50 to-white px-4 py-2 font-medium shadow-sm">
            {author && (
              <div className="flex items-center text-gray-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1.5 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span>{author}</span>
              </div>
            )}

            {author && university && (
              <span className="mx-2 text-gray-400">•</span>
            )}

            {university && (
              <div className="flex items-center text-gray-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1.5 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <span>{university}</span>
              </div>
            )}
          </div>
        )}

        {/* Content section */}
        <div className="relative z-10 mb-4 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-600 shadow-sm">
          <div>
            <span className="mb-1 block font-semibold text-gray-700">
              Context
            </span>
            <p className="italic">{context || "Various contexts"}</p>
          </div>

          {/* Description - Added section with line clamp and ellipsis */}
          <div>
            <span className="mb-1 block font-semibold text-gray-700">
              Description
            </span>
            <div
              className="overflow-hidden transition-all duration-500"
              style={{ maxHeight: isExpanded ? "500px" : "3rem" }}
            >
              <p className="italic" style={getEllipsisStyle()}>
                {description || "No description available"}
              </p>
            </div>
            {!isExpanded && description.length > 150 && (
              <div className="text-primary mt-1 flex items-center text-xs">
                <span>More</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="ml-1 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            )}
          </div>

          <div>
            <span className="mb-1 block font-semibold text-gray-700">
              Concepts
            </span>
            <p className="italic">
              {formattedConcepts ? (
                <span>
                  {formattedConcepts.split(", ").map((concept, index) => (
                    <span
                      key={index}
                      className="mr-1.5 mb-1.5 inline-block rounded border border-gray-200 bg-white px-2 py-0.5 text-xs"
                    >
                      {concept}
                    </span>
                  ))}
                </span>
              ) : (
                "Various CS concepts"
              )}
            </p>
          </div>
        </div>

        {/* Bottom section with score and view button */}
        <div className="relative z-10 mt-auto flex flex-col gap-3">
          {displayConfidenceScore && (
            <div className="w-full">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">
                  Relevance score
                </span>
                <span className="text-xs font-semibold">
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full ${getConfidenceColor()} rounded-full`}
                  style={{ width: confidenceWidth }}
                ></div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end">
            <div className="transform opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:opacity-100">
              <div className="text-primary flex items-center rounded-full bg-white px-3 py-1.5 text-sm font-medium">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1.5 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                View Resource
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ResultCard;
