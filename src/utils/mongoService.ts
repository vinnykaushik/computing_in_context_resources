import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import * as mongoDb from "mongodb";
import { OpenAI } from "openai";
import {
  ResourceDocument,
  FileContent,
  FileInfo,
  BinaryContent,
} from "./types";
import { createEnhancedQueryText, logQueryParsing } from "./phraseAwareSearch";
import * as fs from "fs";
import * as path from "path";

// Reload environment variables to ensure we have the latest values
dotenv.config({ override: true });

// Store the connection string to detect changes
let currentConnectionString = "";

// Use a global variable to maintain the connection across requests
let client: MongoClient | null = null;

// Connection options with proper timeouts and retries
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000, // 10 seconds timeout for server selection
  connectTimeoutMS: 30000, // 30 seconds timeout for initial connection
  socketTimeoutMS: 45000, // 45 seconds for socket timeout
  maxPoolSize: 10, // Max pool size
  minPoolSize: 5, // Min pool size
  maxIdleTimeMS: 30000, // How long a connection can stay idle in the pool
  waitQueueTimeoutMS: 10000, // How long a thread can wait for a connection
};

/**
 * Connect to MongoDB database
 * @param forceReconnect Whether to force a reconnection
 * @returns MongoDB database connection
 */
async function connectToDatabase(forceReconnect = false) {
  try {
    // Get the current connection string
    const MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING;
    if (!MONGODB_CONNECTION_STRING) {
      throw new Error("Missing MONGODB_CONNECTION_STRING environment variable");
    }

    const dbName = process.env.MONGODB_DB_NAME || "computing_in_context";

    // Check if connection string has changed (which would require reconnection)
    const connectionChanged =
      currentConnectionString !== "" &&
      currentConnectionString !== MONGODB_CONNECTION_STRING;

    // Force reconnection if requested OR if connection string changed
    if ((forceReconnect || connectionChanged) && client) {
      console.log("Forcing MongoDB connection to close for reconnection");
      if (connectionChanged) {
        console.log("Connection string changed - reconnecting to new database");
      }
      try {
        await client.close(true); // True means force close
      } catch (closeError) {
        console.error("Error closing MongoDB connection:", closeError);
      }
      client = null;
    }

    // If we already have a connection, return the existing db instance
    if (client && !connectionChanged) {
      // Ping to make sure connection is still alive
      try {
        const db = client.db(dbName);
        await db.command({ ping: 1 });
        return db;
      } catch (pingError) {
        console.log("MongoDB connection lost, reconnecting...", pingError);
        // If ping fails, try to reconnect
        if (client) {
          try {
            await client.close(true);
          } catch (closeError) {
            console.error(
              "Error closing previous MongoDB connection:",
              closeError,
            );
          }
        }
        client = null;
      }
    }

    // Save the current connection string for future comparison
    currentConnectionString = MONGODB_CONNECTION_STRING;

    // Create a new client with robust connection options
    try {
      client = new MongoClient(MONGODB_CONNECTION_STRING, connectionOptions);

      // Connect to the client
      await client.connect();
      console.log(
        `Connected to MongoDB at ${MONGODB_CONNECTION_STRING.split("@").pop()}`,
      ); // Show host without credentials

      // Get db instance and return it
      const db = client.db(dbName);
      console.log(`Using database: ${dbName}`);

      // Return the database
      return db;
    } catch (connectionError) {
      console.error("Error creating new MongoDB connection:", connectionError);
      client = null;
      throw new Error(
        `MongoDB connection failed: ${connectionError instanceof Error ? connectionError.message : "Unknown error"}`,
      );
    }
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);

    // Clean up if connection failed
    if (client) {
      try {
        await client.close(true);
      } catch (closeError) {
        console.error("Error closing failed MongoDB connection:", closeError);
      }
    }

    client = null;
    throw new Error(
      `MongoDB connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Close the MongoDB client.
 */
export async function closeDatabaseConnection() {
  if (client) {
    try {
      await client.close();
      console.log("MongoDB connection closed");
    } catch (error) {
      console.error("Error closing MongoDB connection:", error);
    } finally {
      client = null;
    }
  }
}

/**
 * Force reconnects to the MongoDB database with the current .env settings
 * This is useful when you've updated your .env file and want to connect to a new database
 */
export async function forceReconnectToMongoDB() {
  console.log(
    "Forcing reconnection to MongoDB with current environment variables",
  );
  // Re-load environment variables
  dotenv.config({ override: true });
  // Close any existing connection
  if (client) {
    try {
      await client.close(true);
    } catch (error) {
      console.error("Error closing existing connection:", error);
    }
    client = null;
  }
  // Force reconnection
  return connectToDatabase(true);
}

/**
 * Generates embeddings for the query, with phrase-aware handling
 * @param query The user query string
 * @returns Vector embedding array
 */
async function embedQuery(query: string) {
  dotenv.config();
  const EMBEDDING_MODEL = "text-embedding-3-large";
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  try {
    const openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const enhancedQuery = createEnhancedQueryText(query);

    if (process.env.NODE_ENV === "development") {
      logQueryParsing(query);
      console.log("Enhanced query:", enhancedQuery);
    }

    const response = await openaiClient.embeddings.create({
      input: enhancedQuery,
      model: EMBEDDING_MODEL,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("Empty embedding response from OpenAI");
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error("OpenAI embedding generation error:", error);
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get a list of all file IDs that are already in the database
 */
export async function getProcessedFileIds(): Promise<string[]> {
  try {
    // Use force reconnect = false to avoid unnecessary reconnections
    const db = await connectToDatabase(false);
    const resources = db.collection("resources");

    // Query for all documents that have a drive_id field
    const result = await resources
      .find({ drive_id: { $exists: true } }, { projection: { drive_id: 1 } })
      .toArray();

    // Extract drive_ids from the results
    const driveIds = result
      .map((doc) => doc.drive_id)
      .filter((id) => id && typeof id === "string");

    console.log(
      `Found ${driveIds.length} already processed files in the database`,
    );
    return driveIds;
  } catch (error) {
    console.error("Error getting processed file IDs:", error);
    return [];
  }
}

/**
 * Update an existing resource in the database with new content and metadata
 */
export async function updateExistingResource(
  driveId: string,
  content: FileContent,
  info: FileInfo,
): Promise<void> {
  try {
    const db = await connectToDatabase();
    const resources = db.collection("resources");

    // Find the resource by drive_id
    const existingResource = await resources.findOne({ drive_id: driveId });

    if (!existingResource) {
      throw new Error(`Resource with drive_id ${driveId} not found`);
    }

    // Update the resource with new information
    const updateResult = await resources.updateOne(
      { drive_id: driveId },
      {
        $set: {
          content: content,
          title: info.title,
          language: info.language,
          course_level: info.course_level,
          cs_concepts: info.cs_concepts,
          context: info.context,
          description: info.description,
          sequence_position: info.sequence_position,
          vector_embedding: info.vector_embedding,
          content_sample: info.content_sample,
          file_type: info.file_type,
          university: info.university,
          author: info.author,
          original_filename: info.original_filename,
          updated_at: new Date(),
        },
      },
    );

    console.log(
      `Updated resource with drive_id ${driveId}, matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`,
    );
  } catch (error) {
    console.error(`Error updating resource with drive_id ${driveId}:`, error);
    throw error;
  }
}

/**
 * Search resources using phrase-aware vector search
 * @param query The user's search query
 * @param filters Optional filters to apply alongside vector search
 * @returns Array of search results with relevance scores
 */
export async function searchResources(
  query: string,
  filters: Record<string, string | string[]> = {},
) {
  try {
    const db = await connectToDatabase();
    const resources = db.collection("resources");

    // Verify the collection exists
    const collections = await db
      .listCollections({ name: "resources" })
      .toArray();
    if (collections.length === 0) {
      throw new Error("Resources collection not found in database");
    }

    try {
      const vectorQuery = await embedQuery(query);

      const searchPipeline: mongoDb.Document[] = [
        {
          $vectorSearch: {
            index: "resources_vector_search",
            path: "vector_embedding",
            queryVector: vectorQuery,
            numCandidates: 100,
            limit: 10,
          },
        },
      ];

      if (Object.keys(filters).length > 0) {
        const filterCriteria: Record<string, string | string[] | object> = {};
        ["language", "course_level", "sequence_position", "file_type"].forEach(
          (field) => {
            if (filters[field]) {
              if (field === "sequence_position" || field === "file_type") {
                filterCriteria[field] = String(filters[field]).toLowerCase();
              } else {
                filterCriteria[field] = filters[field];
              }
            }
          },
        );

        if (filters.context && typeof filters.context === "string") {
          filterCriteria.context = { $regex: filters.context, $options: "i" };
        }

        if (Object.keys(filterCriteria).length > 0) {
          searchPipeline.push({ $match: filterCriteria });
        }
      }

      // Add projection for result fields
      searchPipeline.push({
        $project: {
          title: 1,
          content: 1,
          url: 1,
          language: 1,
          course_level: 1,
          context: 1,
          description: 1,
          sequence_position: 1,
          cs_concepts: 1,
          vector_embedding: 1,
          author: 1,
          university: 1,
          file_type: 1,
          score: { $meta: "vectorSearchScore" },
        },
      });

      if (process.env.NODE_ENV === "development") {
        console.log(
          "Search pipeline:",
          JSON.stringify(searchPipeline, null, 2),
        );
      }

      const results = await resources.aggregate(searchPipeline).toArray();
      return results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("resources_vector_search") &&
        errorMessage.includes("index")
      ) {
        throw new Error(
          `Vector search index 'resources_vector_search' not found. Please verify your MongoDB Atlas configuration.`,
        );
      }

      console.error("Search error:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error executing search:", error);
    throw new Error(
      `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function getAllResources(
  filters: Record<string, string | string[]> = {},
  limit: number = 100,
) {
  const db = await connectToDatabase(false);
  const resources = db.collection("resources");

  try {
    const collections = await db
      .listCollections({ name: "resources" })
      .toArray();
    if (collections.length === 0) {
      throw new Error("Resources collection not found in database");
    }

    const filterCriteria: Record<string, string | string[] | object> = {};

    ["language", "course_level", "sequence_position", "file_type"].forEach(
      (field) => {
        if (filters[field]) {
          if (field === "sequence_position" || field === "file_type") {
            filterCriteria[field] = String(filters[field]).toLowerCase();
          } else {
            filterCriteria[field] = filters[field];
          }
        }
      },
    );

    if (filters.context && typeof filters.context === "string") {
      filterCriteria.context = { $regex: filters.context, $options: "i" };
    }

    console.log("MongoDB query:", JSON.stringify(filterCriteria));

    const results = await resources
      .find(filterCriteria)
      .limit(limit)
      .project({
        title: 1,
        content: 1,
        url: 1,
        language: 1,
        course_level: 1,
        sequence_position: 1,
        context: 1,
        description: 1,
        cs_concepts: 1,
        author: 1,
        university: 1,
        file_type: 1,
      })
      .toArray();

    console.log(`Found ${results.length} resources matching filters`);

    return results;
  } catch (error) {
    console.error("Error fetching resources:", error);
    throw new Error(
      `Failed to fetch resources: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function getResourceByDriveId(driveId: string) {
  console.log(`Looking up resource with drive_id: ${driveId}`);
  const db = await connectToDatabase();
  const resources = db.collection("resources");
  try {
    // Look up by drive_id field, not by _id
    const resource = await resources.findOne({ drive_id: driveId });
    if (resource) {
      console.log(`Found resource with drive_id ${driveId}`);
    } else {
      console.log(`No resource found with drive_id ${driveId}`);
    }
    return resource;
  } catch (error) {
    console.error(`Error fetching resource by drive_id ${driveId}:`, error);
    throw error;
  }
}

export async function deleteAllResources() {
  const db = await connectToDatabase();
  const resources = db.collection("resources");
  try {
    await resources.deleteMany({});
    console.log("All resources deleted from MongoDB");
  } catch (error) {
    console.error("Error deleting all resources:", error);
  }
}

/**
 * Get file extension from URL or filename
 * @param url URL or filename
 * @returns File extension (without dot)
 */
function getFileExtension(url: string): string {
  // Try to extract extension from the URL path
  const urlPath = url.split("?")[0]; // Remove query parameters
  const extension = path.extname(urlPath).toLowerCase();

  if (extension) {
    return extension.substring(1); // Remove the dot
  }

  // If no extension found in URL, check for known patterns
  if (url.includes("colab.research.google.com")) {
    return "ipynb";
  }

  return ""; // No extension found
}

/**
 * Get all unique languages from the resources collection
 * @returns Array of unique language values in the database
 */
export async function getUniqueLanguages(): Promise<string[]> {
  try {
    const db = await connectToDatabase();
    const resources = db.collection("resources");

    // Aggregate to find all unique language values
    const result = await resources
      .aggregate([
        { $match: { language: { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$language" } },
        { $sort: { _id: 1 } }, // Sort alphabetically
      ])
      .toArray();

    // Extract language values from result
    const languages = result.map((item) => item._id);

    console.log(`Found ${languages.length} unique languages in the database`);
    return languages;
  } catch (error) {
    console.error("Error getting unique languages:", error);
    return []; // Return empty array on error
  }
}

/**
 * Get all unique values for a specific field from the resources collection
 * @param field The field to get unique values for (e.g., "language", "course_level")
 * @returns Array of unique values for the specified field
 */
export async function getUniqueFieldValues(field: string): Promise<string[]> {
  try {
    const db = await connectToDatabase();
    const resources = db.collection("resources");

    const matchCondition: Record<
      string,
      { $exists: boolean; $nin: (null | string)[] }
    > = {};
    matchCondition[field] = { $exists: true, $nin: [null, ""] };

    const result = await resources
      .aggregate([
        { $match: matchCondition },
        { $group: { _id: `$${field}` } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const values = result.map((item) => item._id);

    console.log(
      `Found ${values.length} unique values for ${field} in the database`,
    );
    return values;
  } catch (error) {
    console.error(`Error getting unique values for ${field}:`, error);
    return [];
  }
}

/**
 * Saves a resource to MongoDB
 * @param url The URL of the resource
 * @param content The content of the resource
 * @param info The extracted info from the resource
 */
export async function saveToMongoDB(
  url: string,
  content: FileContent,
  info: FileInfo,
) {
  const db = await connectToDatabase();
  const resources = db.collection("resources");
  if (!content) {
    console.log(`Failed to save ${url} to MongoDB: Content is null`);
    return;
  }

  const fileType = info.file_type || getFileExtension(url);
  let processedContent: FileContent = content;

  if (
    fileType === "docx" &&
    typeof content === "object" &&
    content !== null &&
    "data" in content
  ) {
    const binaryContent = content as BinaryContent;

    if (binaryContent.extractedText) {
      processedContent = {
        data: binaryContent.data,
        mimeType:
          binaryContent.mimeType ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extractedText: binaryContent.extractedText,
      };
    }
  } else if (fileType === "notebook" || fileType === "ipynb") {
    if (typeof content === "string") {
      try {
        processedContent = JSON.parse(content);
      } catch (e) {
        console.log(`Content for ${url} is not a valid notebook format`, e);
        processedContent = { text: content as string };
      }
    }
  } else if (typeof content === "string") {
    processedContent = content;
  } else if (Buffer.isBuffer(content)) {
    processedContent = content.toString("base64");
  } else if (typeof content === "object" && !Array.isArray(content)) {
    processedContent = content;
  } else {
    try {
      processedContent = JSON.stringify(content);
    } catch (e) {
      console.log(`Failed to stringify content for ${url}`, e);
      return;
    }
  }

  const resource: ResourceDocument = {
    url,
    content: processedContent,
    title: info.title,
    language: info.language,
    course_level: info.course_level,
    cs_concepts: info.cs_concepts,
    context: info.context,
    description: info.description,
    sequence_position: info.sequence_position,
    vector_embedding: info.vector_embedding ?? undefined,
    content_sample: info.content_sample,
    file_type: info.file_type || fileType,
    author: info.author,
    university: info.university,
    original_filename: info.original_filename,
    drive_id: info.drive_id,
    metadata_processed: true,
    date_saved: new Date(),
  };

  await resources.insertOne(resource);
  console.log(
    `Saved ${url} to MongoDB as ${resource.file_type || "unknown type"} by ${resource.author || "unknown author"} from ${resource.university || "unknown university"}`,
  );
}

export async function exportResourcesFromMongoDB(
  output_dir = "downloaded_resources",
) {
  const db = await connectToDatabase();
  const resources = db.collection("resources");

  if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir);
    console.log(`Created output directory: ${output_dir}`);
  }

  const all_resources = await resources.find({}).toArray();
  let count = 0;

  for (const resource of all_resources) {
    try {
      const url = resource.url;
      let filename = "";
      let extension = resource.file_type || "";

      if (extension === "notebook") {
        extension = "ipynb";
      } else if (extension === "javascript") {
        extension = "js";
      } else if (extension === "typescript") {
        extension = "ts";
      } else if (extension === "python") {
        extension = "py";
      }

      if (url.includes("colab.research.google.com")) {
        const file_id = url.split("/").pop() || "";
        filename = `colab_${file_id}`;
      } else if (url.includes("github.com")) {
        const parts = url.replace("https://github.com/", "").split("/");
        const repo = parts.slice(0, 2).join("_");
        filename = `github_${repo}_${parts[parts.length - 1]}`;
        if (filename.includes("blob")) {
          filename = filename.replace("blob_", "");
        }
      } else if (url.includes("drive.google.com")) {
        const file_id = url.match(/[-\w]{25,}/) || ["unknown"];
        filename = `drive_${file_id[0]}`;
      } else {
        filename = `resource_${count}`;
      }

      if (extension && !filename.endsWith(`.${extension}`)) {
        filename += `.${extension}`;
      } else if (!filename.includes(".")) {
        filename += ".txt";
      }

      const filepath = path.join(output_dir, filename);

      let fileContent: string;

      if (typeof resource.content === "string") {
        fileContent = resource.content;
      } else if (Buffer.isBuffer(resource.content)) {
        fileContent = resource.content.toString("utf-8");
      } else {
        fileContent = JSON.stringify(resource.content, null, 2);
      }

      fs.writeFileSync(filepath, fileContent, { encoding: "utf-8" });

      console.log(`Exported: ${filepath}`);
      count++;
    } catch (e) {
      console.error(
        `Error exporting resource ${count}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(`Exported ${count} resources to ${output_dir} directory`);
}

process.on("exit", closeDatabaseConnection);
