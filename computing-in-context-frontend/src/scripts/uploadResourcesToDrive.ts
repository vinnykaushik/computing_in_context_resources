import axios from "axios";
import * as process from "process";
import { resourceLinks } from "./resourceLinks";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import * as dotenv from "dotenv";
import { authorize } from "@/utils/driveService";

// If modifying these scopes, delete token.json.
dotenv.config();
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

/**
 * Downloads a file from a GitHub URL and uploads it to Google Drive.
 *
 * @param url the GitHub URL to download the file from
 * @param authClient the authorized OAuth2 client to use for Google Drive API
 * @returns {Promise<void>} a promise that resolves when the file is downloaded and uploaded to Google Drive
 */
async function downloadFileFromGitHub(
  url: string,
  authClient?: OAuth2Client,
  folderId?: string,
): Promise<void> {
  try {
    if (url.includes("github.com")) {
      // Convert GitHub URL to raw content URL if needed
      let rawUrl = url;
      if (
        url.includes("github.com") &&
        !url.includes("raw.githubusercontent.com")
      ) {
        rawUrl = url
          .replace("github.com", "raw.githubusercontent.com")
          .replace("/blob/", "/");
      }

      console.log(`Downloading file from ${rawUrl}`);
      const response = await axios.get(rawUrl, { responseType: "arraybuffer" });
      const fileStream = Readable.from(Buffer.from(response.data));
      const fileName = url.split("/").pop();
      if (authClient) {
        uploadToDrive(authClient, fileStream, fileName, folderId);
      }
    }
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

  const drive = google.drive({ version: "v3", auth: authClient as never });
  console.log(`Preparing to delete all files in folder: ${folderId}`);

  try {
    // First verify the folder exists
    try {
      await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType",
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

    // Query for all files within the folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      supportsTeamDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = response.data.files;
    if (files?.length === 0) {
      console.log("No files found in folder.");
      return;
    }

    console.log(`Found ${files?.length} files to delete`);

    // Delete each file in the folder
    let successCount = 0;
    let failureCount = 0;

    if (files) {
      for (const file of files) {
        try {
          await drive.files.delete({
            fileId: file.id as string,
            supportsAllDrives: true,
            supportsTeamDrives: true,
          });
          console.log(`Deleted file: ${file.name}`);
          successCount++;
        } catch (error) {
          console.error(`Failed to delete file ${file.name}: ${error}`);
          failureCount++;
        }
      }
    }

    console.log(
      `Deletion complete. Successfully deleted ${successCount} files.`,
    );
    if (failureCount > 0) {
      console.log(`Failed to delete ${failureCount} files.`);
    }
  } catch (error) {
    console.error(`Error in deleteAllFilesInFolder: ${error}`);
  }
}

async function uploadToDrive(
  authClient: OAuth2Client,
  body: Readable,
  fileName?: string,
  folderId?: string,
) {
  const drive = google.drive({ version: "v3", auth: authClient as never });
  console.log("Uploading to Google Drive with authClient");

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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error with folder ID (${folderId}): `, errorMessage);
      console.log("Uploading to root folder instead.");
      folderId = undefined; // Reset folder ID to upload to root
    }
  }

  interface DriveRequestBody {
    name: string;
    mimeType: string;
    parents?: string[];
  }

  const requestBody: DriveRequestBody = {
    name: fileName || "downloaded_file.ipynb",
    mimeType: "application/x-ipynb+json",
  };

  if (folderId) {
    requestBody.parents = [folderId];
  }

  await drive.files.create({
    requestBody,
    media: {
      mimeType: "application/x-ipynb+json",
      body: body,
    },
    supportsAllDrives: true,
    supportsTeamDrives: true,
  });

  console.log(
    `File ${fileName} uploaded to Google Drive${folderId ? " folder" : ""}`,
  );
}

// Check if we want to delete files before uploading
const shouldDeleteFirst = process.argv.includes("--delete");

authorize(SCOPES)
  .then(async (client) => {
    // If delete flag is provided, delete all files in the folder first
    if (shouldDeleteFirst && FOLDER_ID) {
      console.log("Deleting all files in folder before uploading new ones...");
      await deleteAllFilesInFolder(client, FOLDER_ID);
    }

    // Then proceed with uploading
    resourceLinks.forEach((link: string) => {
      downloadFileFromGitHub(link, client, FOLDER_ID);
    });
  })
  .catch((error) => {
    console.error("Error:", error);
  });
