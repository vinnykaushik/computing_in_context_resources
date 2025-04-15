import { processGoogleDriveNotebooks } from "./computing-in-context-frontend/src/scripts/embedResources";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  "Enter the Google Drive Folder ID to fetch notebooks from: ",
  (folderId) => {
    console.log(`Fetching notebooks from Google Drive folder ID: ${folderId}`);

    processGoogleDriveNotebooks(folderId)
      .then(() => {
        console.log("Notebook fetching completed successfully!");
        rl.close();
      })
      .catch((error) => {
        console.error("Error processing Google Drive notebooks:", error);
        rl.close();
      });
  }
);
