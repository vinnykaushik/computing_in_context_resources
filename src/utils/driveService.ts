import { google } from "googleapis";
import { Stream } from "stream";
// import { authenticate } from "@google-cloud/local-auth";
import * as fs from "fs/promises";
import * as path from "path";
import { DriveFileInfo, FileContent } from "./types";

const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
type OAuth2Client = typeof google.auth.OAuth2.prototype;
/**
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize(
  scopes: string[] = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
): Promise<OAuth2Client> {
  let client: OAuth2Client | null =
    (await loadSavedCredentialsIfExist()) as OAuth2Client;
  if (client) {
    return client;
  }

  console.log("Client is null, requesting authentication...");

  const { authenticate } = await import("@google-cloud/local-auth");

  client = await authenticate({
    scopes: scopes,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (!client) {
    throw new Error("Failed to create client instance.");
  }
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
  try {
    const content: string = String(await fs.readFile(TOKEN_PATH));
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials) as OAuth2Client;
  } catch (err) {
    console.error("Error loading credentials:", err);
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client: OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, "utf8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Maps file extensions to MIME types
 */
const MIME_TYPES: Record<string, string> = {
  ".ipynb": "application/x-ipynb+json",
  ".py": "text/x-python",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".html": "text/html",
  ".css": "text/css",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/**
 * Determines if content is a login or authentication page
 * @param content The content to check
 * @returns Whether the content appears to be a login page
 */
function isAuthPage(content: string): boolean {
  // Don't consider it an auth page if it's a valid JSON notebook
  if (
    content.trim().startsWith("{") &&
    content.includes('"cells":') &&
    content.includes('"metadata":')
  ) {
    return false;
  }

  // Common patterns that indicate an actual login page
  const strongAuthPatterns = [
    "<title>sign in</title>",
    "<title>log in</title>",
    "accounts.google.com/servicelogin",
    "google.com/accounts/servicelogin",
    'action="https://accounts.google.com',
    "need to sign in",
    "you'll need to sign in",
    "please sign in to access",
    "login to continue",
    "permission denied",
    "access denied",
  ];

  // Check for strong patterns first
  const lowerContent = content.toLowerCase();
  for (const pattern of strongAuthPatterns) {
    if (lowerContent.includes(pattern)) {
      return true;
    }
  }

  // For weaker patterns, look for combinations of indicators
  const weakAuthPatterns = ["sign in", "login", "log in", "credentials"];

  // Count how many weak patterns appear
  let weakPatternCount = 0;
  for (const pattern of weakAuthPatterns) {
    if (lowerContent.includes(pattern)) {
      weakPatternCount++;
    }
  }

  // Only consider it an auth page if multiple weak patterns appear
  // AND it's an HTML page (not JSON)
  return weakPatternCount >= 2 && lowerContent.includes("<html");
}
/**
 * Builds a query string to find resources in a folder, supporting multiple file types
 *
 * @param folderId the ID of the folder to query
 * @param fileTypes optional array of specific file types to include (extensions without dots)
 * @returns {string} the query string for the Drive API
 */
function buildDriveQuery(folderId: string, fileTypes?: string[]): string {
  let query = `'${folderId}' in parents and trashed=false`;

  if (fileTypes && fileTypes.length > 0) {
    const typeConditions = fileTypes
      .map((type) => {
        const ext = type.startsWith(".") ? type : `.${type}`;
        return `fileExtension='${type}' or mimeType='${MIME_TYPES[ext] || ""}'`;
      })
      .filter((cond) => cond.length > 0 && !cond.endsWith("=''"));

    if (typeConditions.length > 0) {
      query += ` and (${typeConditions.join(" or ")})`;
    }
  }

  return query;
}

/**
 * Gets the file type from the file extension or MIME type
 *
 * @param fileName the file name
 * @param mimeType the MIME type if available
 * @returns {string} the file type (extension without dot)
 */
export function getFileType(fileName: string, mimeType?: string): string {
  // Try to get extension from filename first
  const ext = path.extname(fileName || "").toLowerCase();
  if (ext) {
    return ext.substring(1); // Remove the dot
  }

  // Try to determine from MIME type
  if (mimeType) {
    for (const [extension, mime] of Object.entries(MIME_TYPES)) {
      if (mime === mimeType) {
        return extension.substring(1); // Remove the dot
      }
    }
  }

  return "";
}

/**
 * Finds all files in the specified Google Drive folder.
 *
 * @param folderId The ID of the Google Drive folder to list resources from
 * @param fileTypes Optional array of file types to filter by (extensions without dots)
 * @param maxFiles Optional maximum number of files to retrieve (default: no limit)
 * @returns all resources in the specified folder
 */
export async function listResourcesInDrive(
  folderId: string,
  fileTypes?: string[],
  maxFiles?: number,
): Promise<DriveFileInfo[]> {
  try {
    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });

    const query = buildDriveQuery(folderId, fileTypes);
    console.log(`Listing files from Google Drive with query: ${query}`);

    let allFiles: DriveFileInfo[] = [];
    let nextPageToken: string | undefined = undefined;
    let filesCount = 0;

    // Set a reasonable page size (Google's max is 1000, but 100 is often more stable)
    const pageSize = 100;

    // Continue fetching pages until there are no more or we hit maxFiles
    do {
      console.log(`Fetching page ${nextPageToken ? "with token" : "1"}...`);

      const response = (await drive.files.list({
        q: query,
        fields:
          "nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, iconLink)",
        pageSize: pageSize,
        pageToken: nextPageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })) as {
        data: {
          files?: Array<{
            id?: string;
            name?: string;
            mimeType?: string;
            webViewLink?: string;
            createdTime?: string;
            modifiedTime?: string;
            size?: string;
            iconLink?: string;
          }>;
          nextPageToken?: string;
        };
      };

      const files = response.data.files || [];
      nextPageToken = response.data.nextPageToken;

      const mappedFiles = files.map((file) => ({
        id: file.id || "",
        name: file.name || "",
        mimeType: file.mimeType || undefined,
        webViewLink: file.webViewLink || undefined,
        createdTime: file.createdTime || undefined,
        modifiedTime: file.modifiedTime || undefined,
        size: file.size ? parseInt(file.size) : undefined,
        iconLink: file.iconLink || undefined,
      }));

      allFiles = [...allFiles, ...mappedFiles];
      filesCount = allFiles.length;

      console.log(
        `Retrieved ${mappedFiles.length} files in this page. Total so far: ${filesCount}`,
      );

      if (maxFiles && filesCount >= maxFiles) {
        allFiles = allFiles.slice(0, maxFiles);
        break;
      }
    } while (nextPageToken);

    console.log(
      `Found a total of ${allFiles.length} files in Google Drive folder`,
    );
    return allFiles;
  } catch (error) {
    console.error("Error listing resources from Google Drive:", error);
    throw error;
  }
}

/**
 * Determines if a file is a text-based file based on its MIME type or extension
 *
 * @param mimeType the MIME type of the file
 * @param fileName the name of the file
 * @returns {boolean} true if the file is text-based
 */
function isTextBasedFile(mimeType?: string, fileName?: string): boolean {
  if (!mimeType && !fileName) return false;

  const textMimeTypes = [
    "text/",
    "application/json",
    "application/x-ipynb+json",
    "application/javascript",
    "application/typescript",
    "application/xml",
  ];

  // Check MIME type
  if (mimeType) {
    return textMimeTypes.some((textType) => mimeType.includes(textType));
  }

  // Check file extension
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return [
      ".txt",
      ".py",
      ".js",
      ".ts",
      ".html",
      ".css",
      ".json",
      ".ipynb",
      ".md",
      ".csv",
      ".xml",
      ".r",
      ".sh",
    ].includes(ext);
  }

  return false;
}

/**
 * Downloads a given resource from Google Drive and returns its content.
 * Handles authentication errors and different file types.
 *
 * @param fileId The ID of the file to download
 * @returns The content of the file or null if error/authentication required
 */
export async function downloadResourcesFromDrive(
  fileId: string,
): Promise<FileContent | null> {
  try {
    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth });
    console.log(`Downloading file with ID: ${fileId}`);

    // First, get file metadata to determine the type
    try {
      const fileMetadata = await drive.files.get({
        fileId: fileId,
        fields: "name,mimeType,size",
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });

      const fileName = fileMetadata.data.name || "";
      const mimeType = fileMetadata.data.mimeType || "";

      console.log(`File metadata: name=${fileName}, mimeType=${mimeType}`);

      // Download the file content
      const response = await drive.files.get(
        {
          fileId: fileId,
          alt: "media",
        },
        { responseType: "stream" },
      );

      // Convert the stream to Buffer
      const buffer = await streamToBuffer(response.data);
      const content = buffer.toString("utf8");

      // Check if this is an auth page (indicating we don't have proper access)
      if (isTextBasedFile(mimeType, fileName) && isAuthPage(content)) {
        console.error(
          `File ${fileId} (${fileName}) requires authentication - received login page`,
        );
        return null;
      }

      // Process content based on file type
      if (isTextBasedFile(mimeType, fileName)) {
        // For text-based files
        // If it's a Jupyter notebook or JSON, try to parse it
        if (
          mimeType === "application/x-ipynb+json" ||
          (fileName && fileName.toLowerCase().endsWith(".ipynb")) ||
          mimeType === "application/json"
        ) {
          if (!content.trim().startsWith("{")) {
            console.error(`File ${fileId} is not valid JSON`);
            console.log(
              `Content starts with: ${content.substring(0, 50).replace(/\n/g, " ")}`,
            );

            // Create a minimal valid notebook structure if it's a notebook
            if (
              mimeType === "application/x-ipynb+json" ||
              (fileName && fileName.toLowerCase().endsWith(".ipynb"))
            ) {
              return {
                cells: [],
                metadata: {
                  kernelspec: {
                    display_name: "Python 3",
                    language: "python",
                    name: "python3",
                  },
                },
                nbformat: 4,
                nbformat_minor: 4,
                raw_content: content.substring(0, 5000), // Store the raw content for analysis
              };
            }
            // Return as text for other JSON files
            return content;
          }

          // Parse the content as JSON
          try {
            const jsonContent = JSON.parse(content);

            // For Jupyter notebooks, validate the format
            if (
              mimeType === "application/x-ipynb+json" ||
              (fileName && fileName.toLowerCase().endsWith(".ipynb"))
            ) {
              if (!jsonContent.cells) {
                console.warn(
                  `Notebook ${fileId} doesn't have 'cells' property`,
                );
                jsonContent.cells = [];
              }
            }

            return jsonContent;
          } catch (e) {
            console.error(`Error parsing file as JSON: ${e}`);
            // Return as text if parsing fails
            return content;
          }
        }

        // Return as text for other text-based files
        console.log(`Text file detected: ${fileName}`);
        return content;
      } else {
        // For binary files, return the buffer with metadata
        console.log(`Binary file detected: ${fileName}`);
        return {
          data: buffer,
          mimeType: mimeType,
        };
      }
    } catch (error) {
      // Check if this is a permission error
      const errorMessage = String(error);
      if (
        errorMessage.includes("403") ||
        errorMessage.includes("401") ||
        errorMessage.includes("permission") ||
        errorMessage.includes("access")
      ) {
        console.error(`Permission denied for file ${fileId}:`, error);
        return null;
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error downloading resource from Google Drive: ${error}`);
    return null;
  }
}

/**
 * Convert a stream to a buffer
 *
 * @param stream The stream to convert
 * @returns Promise resolving to a Buffer
 */
function streamToBuffer(stream: Stream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
