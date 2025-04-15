import { authorize } from "../scripts/uploadResourcesToDrive";
import { google } from "googleapis";
import { Stream } from "stream";

/**
 * Finds the fileID of all files in the specified Google Drive folder.
 * @param folderId The ID of the Google Drive folder to list notebooks from
 * @returns all notebooks in the specified folder
 */
export async function listResourcesInDrive(folderId: string) {
  try {
    const auth = await authorize();
    const drive = google.drive({ version: "v3", auth: auth as never });

    // Query for .ipynb files in the specified folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/x-ipynb+json' or fileExtension='ipynb'`,
      fields: "files(id, name, webViewLink)",
      pageSize: 100,
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
