import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import * as mongoDb from "mongodb";
import { OpenAI } from "openai";
import { NotebookDocument, NotebookContent, NotebookInfo } from "./types";
import { extractNotebookInfo } from "@/scripts/embedResources";
import { createEnhancedQueryText, logQueryParsing } from "./phraseAwareSearch";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

let client: MongoClient | null = null;

/**
 * Connect to MongoDB database
 * @returns MongoDB database connection
 */
async function connectToDatabase() {
  if (!client) {
    const MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING;
    if (!MONGODB_CONNECTION_STRING) {
      throw new Error("Missing MONGODB_CONNECTION_STRING environment variable");
    }

    // Initialize the MongoDB client
    client = new MongoClient(MONGODB_CONNECTION_STRING);
    try {
      await client.connect();
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      client = null;
      // Don't recursively call connectToDatabase as it can cause a stack overflow
      throw new Error(
        `MongoDB connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  return client.db("computing_in_context");
}

/**
 * Close the MongoDB client.
 */
export async function closeDatabaseConnection() {
  if (client) {
    await client.close();
    client = null;
    console.log("MongoDB connection closed");
  }
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

    // Create enhanced query that preserves phrases
    const enhancedQuery = createEnhancedQueryText(query);

    // For debugging
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
      // Generate phrase-aware vector embedding
      const vectorQuery = await embedQuery(query);

      // Build the base search pipeline
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

      // Add filters if provided
      if (Object.keys(filters).length > 0) {
        const filterCriteria: Record<string, string | string[]> = {};

        // Process each filter field if it exists
        ["language", "course_level", "sequence_position"].forEach((field) => {
          if (filters[field]) {
            filterCriteria[field] = filters[field];
          }
        });

        // Add $match stage for filters if any were specified
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
          cs_concepts: 1,
          vector_embedding: 1,
          score: { $meta: "vectorSearchScore" },
        },
      });

      // Log the pipeline for debugging
      if (process.env.NODE_ENV === "development") {
        console.log(
          "Search pipeline:",
          JSON.stringify(searchPipeline, null, 2),
        );
      }

      // Execute the aggregation and return results
      const results = await resources.aggregate(searchPipeline).toArray();
      return results;
    } catch (error) {
      // Check if the error is related to the vector search index
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

export async function getResourceById(id: string) {
  console.log("endpoint called");
  const db = await connectToDatabase();
  const resources = db.collection("resources");
  try {
    const resource = await resources.findOne({ _id: new mongoDb.ObjectId(id) });
    console.log("MongoService resource found: ", resource);
    return resource;
  } catch (error) {
    console.error("Error fetching resource by ID:", error);
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

export async function saveToMongoDB(
  url: string,
  content: NotebookContent | null,
  info: NotebookInfo,
) {
  const db = await connectToDatabase();
  const resources = db.collection("resources");
  if (!content) {
    console.log(`Failed to save ${url} to MongoDB`);
    return;
  }

  if (typeof content !== "object") {
    try {
      // Try to parse as JSON if it's a string
      content = JSON.parse(content);
    } catch (e) {
      console.log(`Content for ${url} is not a valid notebook format`, e);
      return;
    }
  }

  const notebook: NotebookDocument = {
    url,
    content: content as NotebookContent,
    language: info.language,
    title: info.title,
    course_level: info.course_level,
    cs_concepts: info.cs_concepts,
    context: info.context,
    sequence_position: info.sequence_position,
    vector_embedding: info.vector_embedding ?? undefined,
    content_sample: info.content_sample,
    metadata_processed: true,
    date_saved: new Date(),
  };

  await resources.insertOne(notebook);
  console.log(`Saved ${url} to MongoDB as .ipynb`);
}

/* export async function updateNotebooksWithEmbeddings() {
  const db = await connectToDatabase();
  const collection = db.collection("resources");
  let count = 0;

  // Find all notebooks
  const all_notebooks = (await collection
    .find({})
    .toArray()) as NotebookDocument[];

  for (const notebook of all_notebooks) {
    try {
      const info = await extractNotebookInfo(notebook);

      // Update the document with new info
      await collection.updateOne(
        { _id: notebook._id },
        {
          $set: {
            language: info.language,
            title: info.title,
            course_level: info.course_level,
            cs_concepts: info.cs_concepts,
            context: info.context,
            sequence_position: info.sequence_position,
            vector_embedding: info.vector_embedding ?? undefined,
            content_sample: info.content_sample,
            metadata_processed: true,
          },
        },
      );

      console.log(`Processed: ${notebook.url}`);
      count++;
    } catch (e) {
      console.error(
        `Error processing notebook ${notebook.url || "unknown"}: ${e}`,
      );
    }
  }

  console.log(`Processed ${count} notebooks with embeddings and metadata`);
} */

export async function exportResourcesFromMongoDB(
  output_dir = "downloaded_notebooks",
) {
  const db = await connectToDatabase();
  const resources = db.collection("resources");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir);
    console.log(`Created output directory: ${output_dir}`);
  }

  // Query all notebooks from MongoDB
  const all_notebooks = await resources.find({}).toArray();
  let count = 0;

  for (const notebook of all_notebooks) {
    try {
      // Extract a filename from the URL
      const url = notebook.url;
      let filename = "";

      if (url.includes("colab.research.google.com")) {
        // For Colab, use the file ID as the filename
        const file_id = url.split("/").pop() || "";
        filename = `colab_${file_id}.ipynb`;
      } else if (url.includes("github.com")) {
        // For GitHub, use the repo and filename
        const parts = url.replace("https://github.com/", "").split("/");
        const repo = parts.slice(0, 2).join("_"); // org_repo
        filename = `github_${repo}_${parts[parts.length - 1]}`;
        if (filename.includes("blob")) {
          // Clean up filename if it contains 'blob'
          filename = filename.replace("blob_", "");
        }
      } else {
        // Generic fallback
        filename = `notebook_${count}.ipynb`;
      }

      // Make sure the filename ends with .ipynb
      if (!filename.endsWith(".ipynb")) {
        filename += ".ipynb";
      }

      // Create full path
      const filepath = path.join(output_dir, filename);

      // Write notebook content to file
      fs.writeFileSync(filepath, JSON.stringify(notebook.content, null, 2), {
        encoding: "utf-8",
      });

      console.log(`Exported: ${filepath}`);
      count++;
    } catch (e) {
      console.error(`Error exporting notebook ${count}: ${e}`);
    }
  }

  console.log(`Exported ${count} notebooks to ${output_dir} directory`);
}
