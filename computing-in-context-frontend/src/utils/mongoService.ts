import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import * as mongoDb from "mongodb";
import { OpenAI } from "openai";

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
      throw new Error("Missing environment variables");
    }

    // Initialize the MongoDB client
    client = new MongoClient(MONGODB_CONNECTION_STRING);
    try {
      await client.connect();
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      client = null;
      connectToDatabase();
      throw error;
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

async function embedQuery(query: string) {
  dotenv.config();
  const EMBEDDING_MODEL = "text-embedding-3-large";

  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openaiClient.embeddings.create({
    input: query,
    model: EMBEDDING_MODEL,
  });
  return response.data[0].embedding;
}

/**
 *
 * @param query
 * @returns
 */
export async function searchResources(query: string) {
  const db = await connectToDatabase();
  console.log("MongoService searchResources called with db:", db);
  const resources = db.collection("resources");
  try {
    const vectorQuery = await embedQuery(query);
    const searchPipeline = [
      {
        $vectorSearch: {
          index: "resources_vector_search",
          path: "vector_embedding",
          queryVector: vectorQuery,
          numCandidates: 100,
          limit: 10,
        },
      },
      {
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
      },
    ];

    const results = await resources.aggregate(searchPipeline).toArray();
    return results;
  } catch (error) {
    console.error("Search error:", error);
    throw error;
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
