import { NextResponse } from "next/server";
import { getResourceById } from "@/utils/mongoService";

export async function GET(req: Request) {
  console.log("Route called:", req.url);
  const url = new URL(req.url);
  console.log("URL:", url);
  const id = url.searchParams.get("id");
  console.log("Resource ID:", id);

  if (!id) {
    return NextResponse.json(
      { error: "Resource ID is required" },
      { status: 400 },
    );
  }

  try {
    const resource = await getResourceById(id);
    console.log("Route response:", resource);

    if (!resource || !resource.content) {
      return NextResponse.json(
        { error: "Resource not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(resource.content);
  } catch (error) {
    console.error("Error fetching notebook:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
