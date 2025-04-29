// app/api/embed/route.ts

import { NextRequest, NextResponse } from "next/server";
import { processGoogleDriveFiles } from "@/scripts/embedResources";

export async function POST(request: NextRequest) {
  try {
    console.log("Received request to process embedding");
    const searchParams = request.nextUrl.searchParams;
    const password = searchParams.get("password");
    let payload = {};
    try {
      const text = await request.text();
      payload = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.log(
        "No JSON body provided or malformed JSON, using empty object",
      );
    }

    console.log("Request body (may be empty):", payload);

    if (password === process.env.PASSWORD) {
      let shouldProcessAll = false;
      if (payload && typeof payload === "object" && "processAll" in payload) {
        shouldProcessAll = Boolean(payload.processAll);
      }

      console.log("Received payload:", payload);
      console.log("Should process all files:", shouldProcessAll);
      try {
        await processGoogleDriveFiles(!shouldProcessAll);
        console.log("Webhook-triggered processing completed successfully");
      } catch (error) {
        console.error("Error in webhook-triggered processing:", error);
        return NextResponse.json(
          { message: "Error in embedding process" },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { message: "Embedding process started successfully" },
        { status: 200 },
      );
    } else {
      return NextResponse.json(
        { message: "Incorrect password" },
        { status: 401 },
      );
    }
  } catch (error) {
    console.error(`Error processing embedding: ${error}`);
    return NextResponse.json(
      { message: `Error processing embedding: ${error}` },
      { status: 500 },
    );
  }
}
