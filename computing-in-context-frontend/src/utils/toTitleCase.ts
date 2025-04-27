export default function toTitleCase(
  str: string | undefined,
): string | undefined {
  return (
    str
      ?.toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || undefined
  );
}
