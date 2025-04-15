import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { Stream } from "stream";
import { authenticate } from "@google-cloud/local-auth";
import * as fs from "fs/promises";
import * as path from "path";

const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize(
  scopes: string[] = ["https://www.googleapis.com/auth/drive.readonly"],
): Promise<OAuth2Client> {
  let client: OAuth2Client | null =
    (await loadSavedCredentialsIfExist()) as unknown as OAuth2Client;
  if (client) {
    return client;
  }

  console.log("Client is null, requesting authentication...");
  client = (await authenticate({
    scopes: scopes,
    keyfilePath: CREDENTIALS_PATH,
  })) as unknown as OAuth2Client;
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
 * Finds the fileID of all files in the specified Google Drive folder.
 * @param folderId The ID of the Google Drive folder to list notebooks from
 * @returns all notebooks in the specified folder
 */
export async function listResourcesInDrive(folderId: string) {
  try {
    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth: auth as never });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType='application/x-ipynb+json' or fileExtension='ipynb')`,
      fields: "files(id, name, webViewLink)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return response.data.files || [];
  } catch (error) {
    console.error("Error listing resources from Google Drive:", error);
    throw error;
  }
}

/**
 * Downloads a given resourece from Google Drive and returns its content as JSON.
 * @param fileId The ID of the file to download
 * @returns The content of the notebook as JSON
 */
export async function downloadResourcesFromDrive(fileId: string) {
  try {
    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth: auth as never });

    // Download the file content
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "stream" },
    );

    // Convert the stream to string
    const streamToString = (stream: Stream): Promise<string> => {
      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    };

    const content = await streamToString(response.data);

    // Parse the notebook content as JSON
    try {
      const notebookContent = JSON.parse(content);
      return notebookContent;
    } catch (e) {
      console.error(`Error parsing Google Drive resource as JSON: ${e}`);
      return null;
    }
  } catch (error) {
    console.error(`Error downloading resource from Google Drive: ${error}`);
    return null;
  }
}
