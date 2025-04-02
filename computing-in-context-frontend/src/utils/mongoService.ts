import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import * as mongoDb from "mongodb";
import OpenAI from "openai";

/**
 * Connect to MongoDB database
 * @returns MongoDB database connection
 */
async function connectToDatabase() {
  dotenv.config();
  const MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING;
  if (!MONGODB_CONNECTION_STRING) {
    throw new Error("Missing environment variables");
  }
  // Connect to MongoDB
  const client: MongoClient = new MongoClient(MONGODB_CONNECTION_STRING);
  await client.connect();

  const db: mongoDb.Db = client.db("computing_in_context");
  return db;
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
