import axios from "axios";
import * as fs from "fs/promises";
import * as path from "path";
import * as process from "process";
import { resourceLinks } from "./resourceLinks";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { configDotenv } from "dotenv";

// If modifying these scopes, delete token.json.
configDotenv();
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content: string = String(await fs.readFile(TOKEN_PATH));
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    console.error("Error loading credentials:", err);
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
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize(): Promise<OAuth2Client> {
  let client: OAuth2Client | null =
    (await loadSavedCredentialsIfExist()) as unknown as OAuth2Client;
  if (client) {
    return client;
  }
  client = (await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  })) as unknown as OAuth2Client;
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

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

async function uploadToDrive(
  authClient: OAuth2Client,
  body: Readable,
  fileName?: string,
  folderId?: string,
) {
  const drive = google.drive({ version: "v3", auth: authClient as never });
  console.log("Uploading to Google Drive with authClient");

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
  });

  console.log(
    `File ${fileName} uploaded to Google Drive${folderId ? " folder" : ""}`,
  );
}

authorize()
  .then((client) => {
    resourceLinks.forEach((link: string) => {
      downloadFileFromGitHub(link, client, FOLDER_ID);
    });
  })
  .catch((error) => {
    console.error(error);
  });
