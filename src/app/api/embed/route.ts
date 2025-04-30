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
        parseError,
      );
    }

    console.log("Request body (may be empty):", payload);

    if (password === process.env.PASSWORD) {
      let shouldProcessAll = false;
      let maxFiles: number | undefined = undefined;

      if (payload && typeof payload === "object") {
        if ("processAll" in payload) {
          shouldProcessAll = Boolean(payload.processAll);
        }

        if ("maxFiles" in payload) {
          const maxFilesValue = Number(payload.maxFiles);
          if (!isNaN(maxFilesValue) && maxFilesValue > 0) {
            maxFiles = maxFilesValue;
          }
        }
      }

      console.log("Received payload:", payload);
      console.log("Should process all files:", shouldProcessAll);
      console.log("Maximum files to process:", maxFiles || "unlimited");

      try {
        await processGoogleDriveFiles(!shouldProcessAll, maxFiles);
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
