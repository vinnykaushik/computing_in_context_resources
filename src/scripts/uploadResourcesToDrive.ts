import { request } from "gaxios";
import * as process from "process";
import { resourceLinks } from "./resourceLinks";
import { google } from "googleapis";
import { Readable } from "stream";
import * as dotenv from "dotenv";
import { authorize, getFileType } from "@/utils/driveService";
import * as path from "path";
import * as fs from "fs";

// If modifying these scopes, delete token.json.
dotenv.config();
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

type OAuth2Client = typeof google.auth.OAuth2.prototype;

// Define allowed resource source types and their configs
interface ResourceSourceConfig {
  convertUrlFunction: (url: string) => string;
  requiresAuth: boolean;
  acceptedFileTypes: string[]; // extensions without the dot
}

// Configuration for supported source types
const resourceSources: Record<string, ResourceSourceConfig> = {
  "github.com": {
    convertUrlFunction: (url: string) =>
      url
        .replace("github.com", "raw.githubusercontent.com")
        .replace("/blob/", "/"),
    requiresAuth: false,
    acceptedFileTypes: [
      "ipynb",
      "py",
      "js",
      "ts",
      "html",
      "css",
      "md",
      "json",
      "csv",
      "xml",
      "r",
      "sh",
      "txt",
      "pdf",
      "doc",
      "docx",
      "ppt",
      "pptx",
      "xls",
      "xlsx",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "svg",
    ],
  },
  "colab.research.google.com": {
    convertUrlFunction: (url: string) => url, // No conversion needed
    requiresAuth: true, // Requires Google authentication
    acceptedFileTypes: ["ipynb"],
  },
  "drive.google.com": {
    convertUrlFunction: (url: string) => url, // No conversion needed
    requiresAuth: true, // Requires Google authentication
    acceptedFileTypes: ["*"], // All file types
  },
  "gist.github.com": {
    convertUrlFunction: (url: string) => {
      // Convert gist URL to raw content URL
      const parts = url.split("/");
      if (parts.length >= 5) {
        // Format: https://gist.github.com/username/gistid
        const username = parts[3];
        const gistId = parts[4].split("?")[0]; // Remove any query params
        // If specific file is in the URL, use it, otherwise return the gist API URL
        if (parts.length >= 6 && parts[5]) {
          return `https://gist.githubusercontent.com/${username}/${gistId}/raw/${parts[5]}`;
        } else {
          return `https://api.github.com/gists/${gistId}`;
        }
      }
      return url; // Return original if can't be converted
    },
    requiresAuth: false,
    acceptedFileTypes: ["*"], // All file types
  },
};

/**
 * Maps file extensions to MIME types
 */
const MIME_TYPES: Record<string, string> = {
  ipynb: "application/x-ipynb+json",
  py: "text/x-python",
  js: "application/javascript",
  ts: "application/typescript",
  html: "text/html",
  css: "text/css",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  xml: "application/xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/**
 * Gets the appropriate MIME type based on file extension
 *
 * @param fileName the name of the file
 * @returns {string} the MIME type for the file
 */
function getMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const ext = extension.substring(1); // Remove the dot

  return MIME_TYPES[ext] || "application/octet-stream"; // Default to binary stream if unknown
}

/**
 * Identifies the source type from a URL
 *
 * @param url URL to analyze
 * @returns Source type key or null if not supported
 */
function getSourceType(url: string): string | null {
  if (!url) return null;

  for (const source in resourceSources) {
    if (url.includes(source)) {
      return source;
    }
  }

  return null;
}

/**
 * Extracts filename from a URL
 *
 * @param url URL to extract filename from
 * @returns Filename or null if not found
 */
function extractFilename(url: string): string | null {
  // Try to extract filename from the URL path
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split("/");
    const lastSegment = segments[segments.length - 1];

    // Check if last segment contains a filename with extension
    if (lastSegment && lastSegment.includes(".")) {
      return lastSegment;
    }

    // Special handling for specific sources
    const sourceType = getSourceType(url);
    if (sourceType === "colab.research.google.com") {
      const fileId = segments[segments.length - 1];
      return `colab_notebook_${fileId}.ipynb`;
    } else if (sourceType === "drive.google.com") {
      // Extract file ID from URL
      const matches = url.match(/[-\w]{25,}/);
      const fileId = matches ? matches[0] : "unknown";
      return `drive_file_${fileId}`;
    }
  } catch (e) {
    console.error(`Error extracting filename from URL: ${url}`, e);
  }

  return null;
}

/**
 * Result of a file operation
 */
interface FileOperationResult {
  success: boolean;
  error?: Error;
}

/**
 * Checks if a file exists on the local filesystem
 *
 * @param filePath Path to check
 * @returns Promise that resolves to true if file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determines if content is an authentication/login page
 */
function isAuthPage(content: string): boolean {
  // Common patterns in authentication pages
  const authPatterns = [
    "sign in",
    "sign-in",
    "login",
    "log in",
    "authenticate",
    "authentication required",
    "permission denied",
    "access denied",
    "not authorized",
    "authorization required",
    "please sign in",
    "please log in",
    "credentials",
    "ServiceLogin",
  ];

  const lowerContent = content.toLowerCase();
  return authPatterns.some((pattern) => lowerContent.includes(pattern));
}

/**
 * Downloads a file from a URL and uploads it to Google Drive.
 *
 * @param url the URL to download the file from
 * @param authClient the authorized OAuth2 client to use for Google Drive API
 * @param folderId the ID of the folder to upload to
 * @returns {Promise<void>} a promise that resolves when the file is downloaded and uploaded to Google Drive
 */
async function downloadFileAndUploadToDrive(
  url: string,
  authClient?: OAuth2Client,
  folderId?: string,
): Promise<void> {
  if (!authClient) {
    console.error("No auth client provided for Google Drive upload");
    return;
  }

  try {
    // Check if URL is from a supported source
    const sourceType = getSourceType(url);
    if (!sourceType) {
      console.error(`Unsupported source URL: ${url}`);
      return;
    }

    const sourceConfig = resourceSources[sourceType];

    // Convert URL if needed
    const downloadUrl = sourceConfig.convertUrlFunction(url);
    console.log(`Downloading from ${sourceType}: ${downloadUrl}`);

    // Download the file using Gaxios
    const response = await request({
      url: downloadUrl,
      responseType: "arraybuffer",
      headers: {
        // Add GitHub token if available and it's a GitHub URL
        ...(process.env.GITHUB_TOKEN && sourceType.includes("github.com")
          ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      // Add retry configuration
      retry: true,
      retryConfig: {
        retry: 3,
        retryDelay: 100,
        statusCodesToRetry: [[500, 599]],
        onRetryAttempt: (err) => {
          console.log(`Retry attempt due to ${err.message}`);
        },
      },
    });

    // Determine filename
    let fileName =
      extractFilename(url) || url.split("/").pop() || "unknown_file";

    // Check if this is a HTML response (which could be an auth page)
    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("text/html")) {
      const content = Buffer.from(response.data as ArrayBuffer).toString(
        "utf8",
      );
      if (isAuthPage(content)) {
        console.log(`Authentication required for ${url}. Skipping.`);
        return;
      }
    }

    // Create a readable stream from the response
    const fileStream = Readable.from(Buffer.from(response.data as ArrayBuffer));

    // Upload to Drive
    await uploadToDrive(authClient, fileStream, fileName, folderId);
  } catch (error) {
    console.error(`Error downloading/uploading ${url}:`, error);
  }
}

/**
 * Deletes all files in a specified Google Drive folder
 *
 * @param authClient the authorized OAuth2 client to use for Google Drive API
 * @param folderId the ID of the folder to delete files from
 * @returns {Promise<void>} a promise that resolves when all files are deleted
 */
export async function deleteAllFilesInFolder(
  authClient: OAuth2Client,
  folderId?: string,
): Promise<void> {
  if (!folderId) {
    console.error("No folder ID provided for deletion");
    return;
  }

  // Create the drive interface with the auth client
  // This will complain about type compatibility but works at runtime
  const drive = google.drive({
    version: "v3",
    auth: authClient,
  });
  console.log(`Preparing to delete all files in folder: ${folderId}`);

  try {
    // First verify the folder exists
    try {
      await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,driveId",
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });
      console.log(`Verified folder with ID: ${folderId}`);
    } catch (error) {
      console.error(
        `Folder with ID ${folderId} not found or inaccessible`,
        error,
      );
      return;
    }

    // Query for all files within the folder with pagination to handle large folders
    let pageToken: string | undefined;
    let allFiles: Array<{ id?: string; name?: string }> = [];

    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken, files(id, name)",
        pageSize: 100,
        supportsAllDrives: true,
        supportsTeamDrives: true,
        includeItemsFromAllDrives: true,
        pageToken: pageToken || undefined,
      });

      const files = response.data.files || [];
      allFiles = allFiles.concat(
        files.map((file) => ({
          id: file.id || "",
          name: file.name || "",
        })),
      );
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    if (allFiles.length === 0) {
      console.log("No files found in folder.");
      return;
    }

    console.log(`Found ${allFiles.length} files to delete`);

    // Delete each file in the folder with better error handling
    let successCount = 0;
    let failureCount = 0;

    // Use a small batch size and introduce a delay to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);

      // Process files in parallel within each small batch
      const deletePromises = batch.map(async (file) => {
        try {
          if (!file.id) {
            throw new Error(`File ${file.name || "unknown"} has no ID`);
          }

          await drive.files.update({
            fileId: file.id,
            requestBody: {
              trashed: true,
            },
            supportsAllDrives: true,
            supportsTeamDrives: true,
          });
          console.log(`Deleted file: ${file.name || "unnamed file"}`);
          return { success: true } as FileOperationResult;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Error deleting file ${file.name || "unnamed file"}: ${errorMessage}`,
          );
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
          } as FileOperationResult;
        }
      });

      // Wait for the current batch to complete
      const results = await Promise.all(deletePromises);
      successCount += results.filter((r) => r.success).length;
      failureCount += results.filter((r) => !r.success).length;

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < allFiles.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `Deletion complete. Successfully deleted ${successCount} files.`,
    );
    if (failureCount > 0) {
      console.log(`Failed to delete ${failureCount} files.`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in deleteAllFilesInFolder: ${errorMessage}`);
  }
}

/**
 * Interface for Drive request body
 */
interface DriveRequestBody {
  name: string;
  mimeType: string;
  parents?: string[];
}

/**
 * Uploads a file to Google Drive
 *
 * @param authClient the authorized OAuth2 client to use for Google Drive API
 * @param body the readable stream of the file content
 * @param fileName the name of the file to upload
 * @param folderId the ID of the folder to upload to
 */
async function uploadToDrive(
  authClient: OAuth2Client,
  body: Readable,
  fileName: string = "downloaded_file",
  folderId?: string,
): Promise<void> {
  // Create the drive interface with the auth client
  // This will complain about type compatibility but works at runtime
  const drive = google.drive({
    version: "v3",
    auth: authClient,
  });
  console.log(`Uploading ${fileName} to Google Drive with authClient`);

  // Validate folder ID before proceeding
  if (folderId) {
    try {
      // Check if folder exists
      await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType",
        supportsAllDrives: true,
      });
      console.log(`Verified folder with ID: ${folderId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error with folder ID (${folderId}): ${errorMessage}`);
      console.log("Uploading to root folder instead.");
      folderId = undefined; // Reset folder ID to upload to root
    }
  }

  // Determine the appropriate MIME type based on file extension
  const mimeType = getMimeType(fileName);
  console.log(`Using MIME type: ${mimeType} for file: ${fileName}`);

  const requestBody: DriveRequestBody = {
    name: fileName,
    mimeType: mimeType,
  };

  if (folderId) {
    requestBody.parents = [folderId];
  }

  try {
    const response = await drive.files.create({
      requestBody,
      media: {
        mimeType: mimeType,
        body: body,
      },
      supportsAllDrives: true,
      supportsTeamDrives: true,
    });

    const fileId = response.data.id;
    console.log(
      `File ${fileName} uploaded to Google Drive${folderId ? " folder" : ""} with ID: ${fileId || "unknown"}`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error uploading file ${fileName}: ${errorMessage}`);
  }
}

/**
 * Main function that processes all resource links
 */
async function main(): Promise<void> {
  const shouldDeleteFirst = process.argv.includes("--delete");

  try {
    // Authorize with Google Drive
    console.log("Authorizing with Google Drive...");
    const client = await authorize(SCOPES);

    if (shouldDeleteFirst && FOLDER_ID) {
      console.log("Deleting all files in folder before uploading new ones...");
      await deleteAllFilesInFolder(client, FOLDER_ID);
    }

    console.log(`Processing ${resourceLinks.length} resource links...`);
    let processedCount = 0;

    // Process each resource URL
    for (const link of resourceLinks) {
      await downloadFileAndUploadToDrive(link, client, FOLDER_ID);
      processedCount++;

      // Basic progress reporting
      if (processedCount % 5 === 0 || processedCount === resourceLinks.length) {
        console.log(
          `Progress: ${processedCount}/${resourceLinks.length} files processed`,
        );
      }
    }

    console.log("All resources processed successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in main execution: ${errorMessage}`);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
