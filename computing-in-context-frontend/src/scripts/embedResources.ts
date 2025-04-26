import { OpenAI } from "openai";
import dotenv from "dotenv";
import {
  FileContent,
  FileInfo,
  NotebookContent,
  TextContent,
  BinaryContent,
} from "../utils/types";
import {
  downloadResourcesFromDrive,
  listResourcesInDrive,
  getFileType,
} from "../utils/driveService";
import {
  deleteAllResources,
  saveToMongoDB,
  getResourceByDriveId,
  getProcessedFileIds,
  updateExistingResource,
} from "../utils/mongoService";
import { CreateEmbeddingResponse, ChatCompletion } from "openai/resources";
import { exit } from "process";

// Load environment variables
dotenv.config();
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-large";
const REASONING_MODEL = process.env.REASONING_MODEL || "gpt-4o";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Set up OpenAI API client
const openai_client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * A utility function to retry operations that might be rate limited
 */
async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 1000,
  backoffFactor: number = 2,
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      // Check if this is a rate limit error (429)
      const isRateLimit =
        (error instanceof Error && error.message.includes("429")) ||
        (error as any)?.status === 429 ||
        (error as any)?.statusCode === 429;

      // If we've reached max retries or it's not a rate limit error, throw
      if (retries >= maxRetries || !isRateLimit) {
        throw error;
      }

      // Log the rate limit and wait
      console.warn(
        `Rate limit hit. Retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`,
      );

      // Wait for the delay period
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase the delay for next attempt (exponential backoff)
      delay *= backoffFactor;
      retries++;
    }
  }
}

/**
 * Extracts university and author information from filename
 * Expected format: "UniversityName_AuthorName_OriginalFilename"
 */
function extractMetadataFromFilename(fileName: string): {
  university: string;
  author: string;
  originalName: string;
} {
  let university = "Unknown University";
  let author = "Unknown Author";
  let originalName = fileName;

  // Try to extract metadata from filename
  const parts = fileName.split("_");
  if (parts.length >= 3) {
    university = parts[0].trim();
    author = parts[1].trim();
    // Join the remaining parts as the original filename
    originalName = parts.slice(2).join("_");

    // Check for "Vineet Kaushik" at the end and remove it
    if (originalName.endsWith(" - Vineet Kaushik")) {
      originalName = originalName.replace(" - Vineet Kaushik", "");
    }
  } else if (parts.length === 2) {
    university = parts[0].trim();
    author = parts[1].trim();
  }

  return { university, author, originalName };
}

/**
 * Extracts text content from different file types
 */
function extractTextContent(
  content: FileContent | null,
  fileType: string,
): string {
  // Handle null content case
  if (content === null) {
    console.warn(
      `Cannot extract text from null content for file type: ${fileType}`,
    );
    return "";
  }

  let textContent = "";

  try {
    switch (fileType) {
      case "notebook":
      case "ipynb":
        // Handle Jupyter notebooks
        const notebookContent = content as NotebookContent;
        if (notebookContent.cells) {
          for (const cell of notebookContent.cells) {
            if (cell.cell_type === "markdown") {
              textContent += Array.isArray(cell.source)
                ? cell.source.join(" ")
                : cell.source;
            } else if (cell.cell_type === "code") {
              const code = Array.isArray(cell.source)
                ? cell.source.join(" ")
                : cell.source;
              textContent += ` ${code}`;
            }
          }
        }
        break;

      case "python":
      case "javascript":
      case "typescript":
      case "r":
      case "html":
      case "css":
      case "xml":
      case "markdown":
      case "text":
        // Handle text-based files
        if (typeof content === "string") {
          textContent = content as TextContent;
        } else if (Buffer.isBuffer(content)) {
          const binaryContent = content as BinaryContent;
          textContent = Buffer.isBuffer(binaryContent.data)
            ? binaryContent.data.toString("utf8")
            : new TextDecoder().decode(binaryContent.data);
        } else if (typeof content === "object" && content !== null) {
          textContent = JSON.stringify(content);
        }
        break;

      case "json":
      case "csv":
        // Handle data files
        if (typeof content === "string") {
          textContent = content as TextContent;
        } else if (Buffer.isBuffer(content)) {
          const binaryContent = content as BinaryContent;
          textContent = Buffer.isBuffer(binaryContent.data)
            ? binaryContent.data.toString("utf8")
            : new TextDecoder().decode(binaryContent.data);
        } else if (typeof content === "object" && content !== null) {
          textContent = JSON.stringify(content);
        }
        break;

      default:
        // For file types we can't directly process, try to extract what we can
        if (typeof content === "string") {
          textContent = content as TextContent;
        } else if (Buffer.isBuffer(content)) {
          const binaryContent = content as BinaryContent;
          textContent = Buffer.isBuffer(binaryContent.data)
            ? binaryContent.data.toString("utf8")
            : new TextDecoder().decode(binaryContent.data);
        } else if (typeof content === "object" && content !== null) {
          try {
            textContent = JSON.stringify(content);
          } catch (e) {
            console.warn(
              `Could not stringify content for unsupported file type: ${fileType}`,
            );
            textContent = "Content extraction not supported for this file type";
          }
        }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error extracting text from ${fileType} file: ${errorMessage}`,
    );
    textContent = "Error extracting content";
  }

  return textContent;
}

/**
 * Generates a viewable URL for the file based on its ID and type
 */
function generateFileUrl(
  fileId: string,
  fileName: string,
  webViewLink?: string,
): string {
  const fileType = getFileType(fileName);

  switch (fileType) {
    case "notebook":
    case "ipynb":
      return `https://colab.research.google.com/drive/${fileId}`;

    case "pdf":
    case "doc":
    case "docx":
    case "ppt":
    case "pptx":
    case "xls":
    case "xlsx":
      return `https://drive.google.com/file/d/${fileId}/view`;

    case "google_doc":
      return `https://docs.google.com/document/d/${fileId}/edit`;

    case "google_sheet":
      return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

    case "google_slides":
      return `https://docs.google.com/presentation/d/${fileId}/edit`;

    default:
      // Use provided webViewLink or default to file view
      return webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  }
}

/**
 * Process all files in the Google Drive folder
 * If onlyNew is true, only process files that haven't been processed before
 */
async function processGoogleDriveFiles(onlyNew: boolean = true): Promise<void> {
  if (!FOLDER_ID) {
    console.error("Missing Google Drive folder ID in environment variables.");
    return;
  }
  console.log(
    `Processing files from Google Drive folder: ${FOLDER_ID} (onlyNew: ${onlyNew})`,
  );

  try {
    const files = await listResourcesInDrive(FOLDER_ID);
    console.log(`Found ${files.length} files in Google Drive folder`);

    // If we're only processing new files, get the list of already processed files
    let processedFileIds: string[] = [];
    if (onlyNew) {
      processedFileIds = await getProcessedFileIds();
      console.log(`Found ${processedFileIds.length} already processed files`);
    }

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      console.log(
        `Processing ${file.name || "unnamed"} (ID: ${file.id || "unknown"})`,
      );

      if (!file.id || !file.name) {
        console.error(`Invalid file data: missing ID or name`);
        failureCount++;
        continue;
      }

      // Skip already processed files if onlyNew is true
      if (onlyNew && processedFileIds.includes(file.id)) {
        console.log(`Skipping already processed file: ${file.name}`);
        skippedCount++;
        continue;
      }

      try {
        const content = await withRateLimitRetry(() =>
          downloadResourcesFromDrive(file.id),
        );

        // Skip files with null content (usually due to permission issues)
        if (content === null) {
          console.warn(
            `No content downloaded for file: ${file.name} (ID: ${file.id}). Skipping.`,
          );
          failureCount++;
          continue;
        }

        const fileType = getFileType(file.name);
        const url = generateFileUrl(file.id, file.name, file.webViewLink);

        console.log(`File type detected: ${fileType}`);

        // Extract metadata from filename (university and author)
        const { university, author, originalName } =
          extractMetadataFromFilename(file.name);
        console.log(
          `Metadata: University=${university}, Author=${author}, OriginalName=${originalName}`,
        );

        // Extract information based on file type
        const info = await extractFileInfo(content, fileType, originalName);

        // Add university and author to the file info
        const enrichedInfo: FileInfo = {
          ...info,
          university,
          author,
          original_filename: originalName,
          drive_id: file.id,
        };

        // Check if this file is already in the database by drive_id
        const existingResource = await getResourceByDriveId(file.id);

        if (existingResource) {
          // Update existing resource
          await updateExistingResource(file.id, content, enrichedInfo);
          console.log(`Updated existing resource: ${file.name}`);
        } else {
          // Save as new resource
          await saveToMongoDB(url, content, enrichedInfo);
          console.log(`Saved new resource: ${file.name}`);
        }

        successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Error processing file ${file.name}: ${errorMessage}`);
        failureCount++;
        // Continue with next file instead of stopping the entire process
        continue;
      }
    }

    console.log(
      `Processing complete: ${successCount} files processed successfully, ${failureCount} failed, ${skippedCount} skipped`,
    );
    exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error processing Google Drive files: ${errorMessage}`);
    throw error;
    exit(1);
  }
}

/**
 * Extract file information and metadata
 */
export async function extractFileInfo(
  content: FileContent | null,
  fileType: string,
  fileName: string,
): Promise<FileInfo> {
  // Extract text content based on file type
  const textContent = extractTextContent(content, fileType);

  let title = "";
  let language = "";
  let context = "general programming";
  let sequencePosition = "middle";
  let level = "CS1";
  let csConcepts = "";
  let embedding: number[] | null = null;

  // Extract title
  try {
    if ((!title || title.length < 3) && textContent.length > 0) {
      const titlePrompt = `
        Extract the title from this content. 
        Return only the title in plain text. Do not surround in quotes.
        Content: ${textContent.substring(0, 1000)}
      `;
      const response: ChatCompletion = await withRateLimitRetry(() =>
        openai_client.chat.completions.create({
          model: REASONING_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
        }),
      );
      if (response.choices[0].message.content) {
        title = response.choices[0].message.content.trim();
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error extracting title: ${errorMessage}`);
    // Use filename as fallback
    title = fileName || "Untitled Document";
  }

  // Only try to determine language and other metadata if we have text content
  if (textContent.length > 0) {
    // Determine language based on file type or content
    try {
      // First try to infer from file type
      switch (fileType) {
        case "python":
        case "py":
          language = "python";
          break;
        case "javascript":
        case "js":
          language = "javascript";
          break;
        case "typescript":
        case "ts":
          language = "typescript";
          break;
        case "r":
          language = "r";
          break;
        case "html":
          language = "html";
          break;
        case "css":
          language = "css";
          break;
        case "markdown":
        case "md":
          language = "markdown";
          break;
        default:
          // If we can't determine from file type, ask the LLM
          const languagePrompt = `
            Determine the programming language used in this content.
            Return only the language name. If multiple, separate with commas.
            Content: ${textContent.substring(0, 4000)}
          `;

          const response: ChatCompletion = await withRateLimitRetry(() =>
            openai_client.chat.completions.create({
              model: REASONING_MODEL,
              messages: [{ role: "user", content: languagePrompt }],
            }),
          );

          if (response.choices[0].message.content) {
            language = response.choices[0].message.content.trim().toLowerCase();
          }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error extracting language: ${errorMessage}`);
      // Default to file type if we can't determine language
      language = fileType !== "unknown" ? fileType : "unknown";
    }

    // Extract context/topic information
    try {
      const contextPrompt = `
        Identify the real-world context or topic of this content. 
        Examples include: insurance verification, movie theatre admission, blood donor eligibility, 
        airline systems, smartphone pricing, robotics competition, fashion rating, virtual pet game, 
        vacation planning, tuition calculation, university admissions, language games, Pac-Man game, 
        mathematical concepts.
        
        Return a brief phrase (2-5 words) that best describes the context. Only include the context,
        not any additional text or explanation.
        If mathematical, specify the type of math (e.g., "number theory - Armstrong numbers").
        If game-related, specify the game type (e.g., "game - Pac-Man").
        
        Content: ${textContent.substring(0, 4000)}
      `;

      const response: ChatCompletion = await withRateLimitRetry(() =>
        openai_client.chat.completions.create({
          model: REASONING_MODEL,
          messages: [{ role: "user", content: contextPrompt }],
        }),
      );
      if (response.choices[0].message.content) {
        context = response.choices[0].message.content.trim();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error extracting context: ${errorMessage}`);
    }

    // Determine sequence position
    try {
      const sequencePrompt = `
        Analyze this content and determine where it would likely appear in a course sequence.
        Consider:
        1. Complexity of concepts (basic concepts suggest early placement)
        2. References to previous knowledge (more references suggest later placement)
        3. Depth of application (complex applications suggest later placement)
        4. Presence of terms like "introduction", "final project", "capstone", etc.
        
        Return ONLY ONE of these values, and nothing else:
        - "beginning" (first 20% of a course, introduces basic concepts)
        - "middle" (middle 60% of a course, builds on fundamentals)
        - "end" (final 20%, integrates multiple concepts, more complex applications)
        
        Content: ${textContent.substring(0, 4000)}
      `;

      const response: ChatCompletion = await withRateLimitRetry(() =>
        openai_client.chat.completions.create({
          model: REASONING_MODEL,
          messages: [{ role: "user", content: sequencePrompt }],
        }),
      );

      if (response.choices[0].message.content) {
        sequencePosition = response.choices[0].message.content
          .trim()
          .toLowerCase();

        // Normalize response to one of our three categories
        if (sequencePosition.includes("beginning")) {
          sequencePosition = "beginning";
        } else if (sequencePosition.includes("end")) {
          sequencePosition = "end";
        } else {
          sequencePosition = "middle";
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error determining sequence position: ${errorMessage}`);
    }

    // Only determine course level for programming-related content
    const programmingFileTypes = [
      "notebook",
      "ipynb",
      "python",
      "py",
      "javascript",
      "js",
      "typescript",
      "ts",
      "r",
    ];
    if (programmingFileTypes.includes(fileType)) {
      try {
        const levelPrompt = `
          Using the below information, determine the course level of this lesson. Only return one of: [CS0, CS1, CS2, CS3].

          CS0: A course meant to introduce students to programming. This is a course that does not require any prior programming experience.
          CS1: The first required programming course of the Computer Science major.
          CS2: The second required programming course of the Computer Science major. This should not be a class typically taken in the same term as CS1.
          CS3: The third required course of the Computer Science major. This should not be a class typically taken in the same term as CS2.
          
          Content: ${textContent.substring(0, 4000)}
        `;

        const response: ChatCompletion = await withRateLimitRetry(() =>
          openai_client.chat.completions.create({
            model: REASONING_MODEL,
            messages: [{ role: "user", content: levelPrompt }],
          }),
        );

        if (response.choices[0].message.content) {
          level = response.choices[0].message.content.trim().toUpperCase();
          if (!["CS0", "CS1", "CS2", "CS3"].includes(level)) {
            level = "CS1"; // Default to CS1 if we can't determine
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Error determining course level: ${errorMessage}`);
      }
    } else {
      level = "N/A"; // Not applicable for non-programming files
    }

    // Extract CS concepts for programming-related content
    if (programmingFileTypes.includes(fileType)) {
      try {
        const conceptsPrompt = `
          Extract the main Computer Science concepts from this content.
          Return only 3-7 key CS concepts as a comma-separated list. 
          Do not include any introduction or explanation.
          Content: ${textContent.substring(0, 4000)}
        `;

        const response: ChatCompletion = await withRateLimitRetry(() =>
          openai_client.chat.completions.create({
            model: REASONING_MODEL,
            messages: [{ role: "user", content: conceptsPrompt }],
          }),
        );

        if (response.choices[0].message.content) {
          csConcepts = response.choices[0].message.content.trim();
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Error extracting CS concepts: ${errorMessage}`);
      }
    } else {
      // For non-programming files, extract general concepts
      try {
        const conceptsPrompt = `
          Extract the main concepts or topics from this content.
          Return only 3-7 key concepts as a comma-separated list. 
          Do not include any introduction or explanation.
          Content: ${textContent.substring(0, 4000)}
        `;

        const response: ChatCompletion = await withRateLimitRetry(() =>
          openai_client.chat.completions.create({
            model: REASONING_MODEL,
            messages: [{ role: "user", content: conceptsPrompt }],
          }),
        );

        if (response.choices[0].message.content) {
          csConcepts = response.choices[0].message.content.trim();
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Error extracting concepts: ${errorMessage}`);
      }
    }

    // Generate embedding for the content only if we have content
    try {
      // Limit content length for embedding to the model's maximum context window
      const contentForEmbedding = textContent.substring(0, 8192);
      if (contentForEmbedding.length > 0) {
        const embeddingResponse: CreateEmbeddingResponse =
          await withRateLimitRetry(() =>
            openai_client.embeddings.create({
              input: contentForEmbedding,
              model: EMBEDDING_MODEL,
            }),
          );
        embedding = embeddingResponse.data[0].embedding;
      } else {
        console.warn("No text content available for embedding generation");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error generating embedding: ${errorMessage}`);
    }
  }

  return {
    title,
    language,
    course_level: level,
    cs_concepts: csConcepts,
    context,
    sequence_position: sequencePosition,
    vector_embedding: embedding,
    content_sample: textContent.substring(0, 500),
    file_type: fileType,
  };
}

// Add CLI command to process all files
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const processAll = args.includes("--all");
  const deleteFirst = args.includes("--delete");

  try {
    if (deleteFirst) {
      console.log("Deleting all resources from MongoDB...");
      await deleteAllResources();
      console.log("Deleted all resources from MongoDB.");
    }

    // Process files
    await processGoogleDriveFiles(!processAll);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in main function: ${errorMessage}`);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Error in main function: ${errorMessage}`);
  process.exit(1);
});
