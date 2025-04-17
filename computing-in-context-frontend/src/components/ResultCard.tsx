type resultCardProps = {
  title: string;
  language: string;
  course_level: string;
  context: string;
  cs_concepts: string;
  confidenceScore: number;
  link: string;
};

export default function ResultCard({
  title,
  language,
  course_level,
  context,
  cs_concepts,
  confidenceScore,
  link,
}: resultCardProps) {
  const confidenceColor =
    confidenceScore >= 0.9
      ? "bg-green-700"
      : confidenceScore >= 0.8
        ? "bg-green-600"
        : confidenceScore >= 0.7
          ? "bg-green-500"
          : confidenceScore >= 0.6
            ? "bg-green-400"
            : confidenceScore >= 0.5
              ? "bg-yellow-500"
              : confidenceScore >= 0.4
                ? "bg-yellow-600"
                : confidenceScore >= 0.3
                  ? "bg-orange-500"
                  : confidenceScore >= 0.2
                    ? "bg-orange-600"
                    : confidenceScore >= 0.1
                      ? "bg-red-500"
                      : "bg-red-700";

  const textColor = confidenceColor.replace("bg-", "text-");

  return (
    <a href={link} target="_blank" rel="noreferrer">
      <div className="group relative rounded-lg bg-gray-100 p-4 shadow-md duration-300 hover:bg-gradient-to-r hover:shadow-lg hover:transition-all">
        <h2 className="group-hover:from-secondary group-hover:to-tertiary inline bg-gradient-to-l from-gray-700 to-gray-700 bg-clip-text font-mono text-2xl font-bold text-transparent transition-all duration-300 group-hover:underline group-hover:decoration-black">
          {removeExtraCharacters(title)}
        </h2>
        <div>Language: {toTitleCase(language)}</div>
        <div>Course Level: {course_level}</div>
        <div>Sequence Position: {toTitleCase(context)}</div>
        <div>Lesson Context: {toTitleCase(context)}</div>
        <div>Concepts Covered: {toTitleCase(cs_concepts)}</div>
        <div className="flex items-center">
          <span className={`${textColor}`}>
            Confidence Score: {(confidenceScore * 100).toPrecision(2)}%
          </span>
          <div className="ml-2 h-2 flex-1 rounded bg-gray-300">
            <div
              className={`h-2 rounded ${confidenceColor}`}
              style={{ width: `${confidenceScore * 100}%` }}
            />
          </div>
        </div>
      </div>
    </a>
  );
}

function removeExtraCharacters(str: string): string {
  return str.replace(/"/g, "").trim();
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
