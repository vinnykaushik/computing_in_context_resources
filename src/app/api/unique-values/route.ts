import { NextResponse } from "next/server";
import { getUniqueFieldValues } from "@/utils/mongoService";

/**
 * GET route handler to fetch unique values for a specific field
 * Used to populate filter dropdowns
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const field = url.searchParams.get("field");

    if (!field) {
      return NextResponse.json(
        { error: "Missing required 'field' parameter" },
        { status: 400 },
      );
    }

    const allowedFields = [
      "language",
      "course_level",
      "sequence_position",
      "file_type",
    ];
    if (!allowedFields.includes(field)) {
      return NextResponse.json(
        { error: `Invalid field. Allowed fields: ${allowedFields.join(", ")}` },
        { status: 400 },
      );
    }

    const values = await getUniqueFieldValues(field);

    if (process.env.NODE_ENV === "development") {
      console.log(`API: Found ${values.length} unique values for ${field}`);
    }

    return NextResponse.json(values);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Error fetching unique values: ${errorMessage}`);
    return NextResponse.json(
      { error: "Failed to fetch unique values", details: errorMessage },
      { status: 500 },
    );
  }
}
