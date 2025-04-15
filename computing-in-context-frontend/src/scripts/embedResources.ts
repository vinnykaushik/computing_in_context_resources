import { OpenAI } from "openai";
import dotenv from "dotenv";
import { NotebookDocument, NotebookInfo } from "@/utils/types";
import {
  downloadResourcesFromDrive,
  listResourcesInDrive,
} from "@/utils/driveService";
import { saveToMongoDB } from "@/utils/mongoService";

// Load environment variables
dotenv.config();
const EMBEDDING_MODEL = "text-embedding-3-large";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Set up OpenAI API client
const openai_client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function processGoogleDriveNotebooks() {
  if (!FOLDER_ID) {
    console.error("Missing Google Drive folder ID in environment variables.");
    return;
  }
  console.log(`Processing notebooks from Google Drive folder: ${FOLDER_ID}`);

  try {
    // Get list of notebooks from the Drive folder
    const notebooks = await listResourcesInDrive(FOLDER_ID);
    console.log(`Found ${notebooks.length} notebooks in Google Drive folder`);

    // Process each notebook
    for (const notebook of notebooks) {
      console.log(`Processing ${notebook.name} (ID: ${notebook.id})`);

      if (!notebook.id) {
        console.error(`No ID found for notebook ${notebook.name}`);
        throw Error;
      }
      // Download the notebook content
      const content = await downloadResourcesFromDrive(notebook.id);

      // Generate a URL for the notebook (using the webViewLink)
      const url =
        notebook.webViewLink ||
        `https://drive.google.com/file/d/${notebook.id}/view`;

      const info = await extractNotebookInfo(content);

      // Save to MongoDB
      await saveToMongoDB(url, content, info);
    }

    console.log(
      `Successfully processed ${notebooks.length} notebooks from Google Drive`,
    );
  } catch (error) {
    console.error("Error processing Google Drive notebooks:", error);
  }
}

export async function extractNotebookInfo(
  notebook: NotebookDocument,
): Promise<NotebookInfo> {
  const content = notebook.content;
  let text_content = "";

  // Extract all text from notebook cells
  if (content.cells) {
    for (const cell of content.cells) {
      if (cell.cell_type === "markdown") {
        text_content += Array.isArray(cell.source)
          ? cell.source.join(" ")
          : cell.source;
      } else if (cell.cell_type === "code") {
        const code = Array.isArray(cell.source)
          ? cell.source.join(" ")
          : cell.source;
        text_content += ` ${code}`;
      }
    }
  }

  let title = "";
  let language = "";
  let context = "general programming";
  let sequence_position = "middle";
  let level = "CS1";
  let cs_concepts = "";
  let embedding = null;

  // Extract title
  try {
    const title_prompt = `
      Extract the title of this notebook content. 
      Return only the title as a string.
      Content: ${text_content.substring(0, 500)}
    `;
    const response = await openai_client.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: title_prompt }],
    });
    if (!response.choices[0].message.content) {
      throw new Error("No choices returned from OpenAI API");
    }
    title = response.choices[0].message.content.trim();
  } catch (e) {
    console.error(`Error extracting title: ${e}`);
  }

  // Extract language information
  try {
    const language_prompt = `
      Determine the programming language used in this notebook content.
      Return only the language name. If multiple, separate with commas.
      Content: ${text_content.substring(0, 4000)}
    `;

    const response = await openai_client.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: language_prompt }],
    });

    if (!response.choices[0].message.content) {
      throw new Error("No choices returned from OpenAI API");
    }

    language = response.choices[0].message.content.trim().toLowerCase();
  } catch (e) {
    console.error(`Error extracting language: ${e}`);
  }

  // Extract context/topic information
  try {
    const context_prompt = `
      Identify the real-world context or topic of this notebook. 
      Examples include: insurance verification, movie theatre admission, blood donor eligibility, 
      airline systems, smartphone pricing, robotics competition, fashion rating, virtual pet game, 
      vacation planning, tuition calculation, university admissions, language games, Pac-Man game, 
      mathematical concepts.
      
      Return a brief phrase (2-5 words) that best describes the context.
      If mathematical, specify the type of math (e.g., "number theory - Armstrong numbers").
      If game-related, specify the game type (e.g., "game - Pac-Man").
      
      Content: ${text_content.substring(0, 4000)}
    `;

    const response = await openai_client.chat.completions.create({
      model: "o3-mini",
      messages: [{ role: "user", content: context_prompt }],
    });
    if (!response.choices[0].message.content) {
      throw new Error("No choices returned from OpenAI API");
    }
    context = response.choices[0].message.content.trim();
  } catch (e) {
    console.error(`Error extracting context: ${e}`);
  }

  // Determine sequence position
  try {
    const sequence_prompt = `
      Analyze this notebook and determine where it would likely appear in a course sequence.
      Consider:
      1. Complexity of concepts (basic concepts suggest early placement)
      2. References to previous knowledge (more references suggest later placement)
      3. Depth of application (complex applications suggest later placement)
      4. Presence of terms like "introduction", "final project", "capstone", etc.
      
      Return ONLY ONE of these values:
      - "beginning" (first 20% of a course, introduces basic concepts)
      - "middle" (middle 60% of a course, builds on fundamentals)
      - "end" (final 20%, integrates multiple concepts, more complex applications)
      
      Content: ${text_content.substring(0, 4000)}
    `;

    const response = await openai_client.chat.completions.create({
      model: "o3-mini",
      messages: [{ role: "user", content: sequence_prompt }],
    });

    if (!response.choices[0].message.content) {
      throw new Error("No choices returned from OpenAI API");
    }
    sequence_position = response.choices[0].message.content
      .trim()
      .toLowerCase();

    // Normalize response to one of our three categories
    if (sequence_position.includes("beginning")) {
      sequence_position = "beginning";
    } else if (sequence_position.includes("end")) {
      sequence_position = "end";
    } else {
      sequence_position = "middle";
    }
  } catch (e) {
    console.error(`Error determining sequence position: ${e}`);
  }

  // Determine course level
  try {
    const level_prompt = `
      Using the below information, determine the course level of this lesson. Only return one of: [CS1, CS2, CS3].

      CS1: The first required programming course of the Computer Science major.
      CS2: The second required programming course of the Computer Science major. This should not be a class typically taken in the same term as CS1.
      CS3: The third required course of the Computer Science major. This should not be a class typically taken in the same term as CS2. NOTE: If your
      department or institution does not have a required third course in the Computer Science major – that is, if there is more than one course that 
      Computer Science majors can take immediately following the required CS2 course – provide information about the required Computer Science course 
      that most students who are Computer Science majors take after CS2 (e.g., Data Structures). Be sure to reference the same course for CS3 across all reporting periods.
    `;

    const response = await openai_client.chat.completions.create({
      model: "o3-mini",
      messages: [{ role: "user", content: level_prompt }],
    });

    if (!response.choices[0].message.content) {
      throw new Error("No choices returned from OpenAI API");
    }

    level = response.choices[0].message.content.trim().toUpperCase();
    if (!["CS1", "CS2", "CS3"].includes(level)) {
      level = "CS1"; // Default to CS1 if we can't determine
    }
  } catch (e) {
    console.error(`Error determining course level: ${e}`);
  }

  // Extract CS concepts
  try {
    const concepts_prompt = `
      Extract the main Computer Science concepts from this notebook content.
      Return only 3-7 key CS concepts as a comma-separated list.
      Content: ${text_content.substring(0, 4000)}
    `;

    const response = await openai_client.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: concepts_prompt }],
    });

    if (!response.choices[0].message.content) {
      throw new Error("No choices returned from OpenAI API");
    }

    cs_concepts = response.choices[0].message.content.trim();
  } catch (e) {
    console.error(`Error extracting CS concepts: ${e}`);
  }

  // Generate embedding for the content
  try {
    const embedding_response = await openai_client.embeddings.create({
      input: text_content.substring(0, 8192), // Truncate if needed
      model: EMBEDDING_MODEL,
    });
    embedding = embedding_response.data[0].embedding;
  } catch (e) {
    console.error(`Error generating embedding: ${e}`);
  }

  return {
    title,
    language,
    course_level: level,
    cs_concepts,
    context,
    sequence_position,
    vector_embedding: embedding,
    content_sample: text_content.substring(0, 500),
  };
}

processGoogleDriveNotebooks();
