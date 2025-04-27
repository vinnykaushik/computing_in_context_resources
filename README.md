# Computing in Context

## What is Computing in Context?

At the time of requesting these resources from schools, the CIC defined computing in context in 2 ways:

- integrating different disciplines or domains into computing curriculum (e.g., applying computing techniques to topics in the Humanities discipline), and/or
- regularly updating curriculum and assignments to cover topics relevant to today’s students (e.g., analyzing Twitter data to evaluate algorithmic bias in an election year).

The CIC is building a page on their website that organizes the resources and their components to make creating computing in context courses easier. In order to maintain this search site, the CIC needs to own copies of the resources. This repository contains the frontend code for an easy way for instructors to search these lesson plans.

## Setting up the .env

For this website to work, we have a few required environment variables; Megan should be able to provide you with access to all of these.

`MONGODB_CONNECTION_STRING`: Ask Megan for this. This allows you to connect to the MongoDB database and write/update stored data.

#

For AI analysis, choose either:

`OPENAI_API_KEY`: Allows for necessary GenAI operations to by carried out.

OR

`GEMINI_API_KEY`: If you want to use Gemini models. Many of these are free, so this can help keep costs down.

The Gemini Base URL allows the user to access Gemini models through the OpenAI TypeScript library. See `embedResources.ts`.

`GEMINI_BASE_URL`=https://generativelanguage.googleapis.com/v1beta/openai/.

#

To connect to Google OAuth, which is needed to access Drive files, you need:

`GOOGLE_OAUTH_CLIENT_ID`: Needs to be generated in your Google Cloud Console. Create a new project, navigate to APIs & Services &rarr; Credentials &rarr; Create Credentials, and follow the instructions given. Make sure to create **desktop app credentials**.

`GOOGLE_OAUTH_CLIENT_SECRET`: Same steps as above. Make sure to also save your `token.json` file to the server directory.

The FolderId is the folder in our shared drive that holds all Computing in Context resources.

`GOOGLE_DRIVE_FOLDER_ID`=13OiLnKPq4MuFgRVNMg-Zr-ES-ZaLCiAx

## Starting the Server

To run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Project Structure

There are three main pieces of this project:

### The Frontend

This provides an easy way for users to search these resources, integrating well with the CIC's brand identity.

### Embedding Documents

Resources are processed in the `cic-multi-database` repository, where the CIC's server is based. We have a webhook that can easily be called to process new files as soon as they are uploaded.

### Data Ingress

Resources are submitted to the CIC through a Google Form; once these are written to a spreadsheet, a Google Apps Script ensures that they are stored in the correct folder and calls the aforementioned webhook.

## Resource Schema

Resources in the MongoDB database follow this structure:

```typescript
// Resource Document Schema

{
  url: string,                   // Original source URL
  content: FileContent,          // Resource content (varies by file type)
  title: string,                 // Resource title
  language: string,              // Programming language
  course_level: string,          // Academic level (e.g., intro, advanced)
  cs_concepts: string[],         // Computer science concepts covered
  context: string,               // Context or discipline integration
  description: string,           // Brief resource description
  sequence_position: string,     // Position in curriculum sequence
  vector_embedding: number[],    // Embedding vector for semantic search
  content_sample: string,        // Text sample for preview
  file_type: string,             // File format (pdf, docx, ipynb, etc.)
  author: string,                // Resource author
  university: string,            // Associated institution
  original_filename: string,     // Original file name
  drive_id: string,              // Google Drive file identifier
  metadata_processed: boolean,   // Processing status flag
  date_saved: Date               // Resource creation timestamp
}
```

All fields are indexed for efficient querying, with special vector indexing for semantic search capabilities.

## Search Logic

The application uses MongoDB Atlas Vector Search for intelligent resource discovery:

1. **Phrase-Aware Search**: Queries are processed to preserve multi-word phrases, significantly improving search accuracy for domain-specific terminology.

2. **Vector Embedding**: User queries are encoded into high-dimensional vectors using OpenAI's `text-embedding-3-large` model.

3. **Semantic Matching**: These vectors find conceptually similar resources, even when exact keywords aren't present.

4. **Hybrid Filtering**: Combines vector search with traditional filters:

   - Programming language
   - Course level
   - Sequence position
   - File type
   - Context/discipline

5. **Relevance Scoring**: Results are ranked by semantic similarity to the original query.

6. **Fallback Options**: When vector search returns limited results, the system can fall back to traditional filtering.

Example: Searching for "recursive algorithms" will find resources about recursion, even if they don't explicitly use that terminology, while filters can narrow results to specific programming languages or academic levels.

## Tech Stack

## Frontend 🖥️

- **Next.js** ⚡ - React framework for production
- **TypeScript** 📘 - Type-safe JavaScript
- **TailwindCSS v4** 🎨 - Utility-first CSS

## Backend 🔌

- **Node.js** 🟢 - JavaScript runtime
- **Next.js API Routes** 🛣️ - Backend API endpoints
- **MongoDB** 🍃 - NoSQL database
- **Google OAuth** 🔐 - Authentication

## AI Integration 🧠

- **OpenAI API** 🤖 (GPT-4o)
- **Google Gemini API** 💎 (Alternative)

## Document Processing 📄

- **pdf-parse** 📕 - PDF processing
- **mammoth** 📝 - Word document processing
- **react-markdown/marked** ⬇️ - Markdown processing

## Development Tools 🛠️

- **pnpm** 📦 - Fast, disk space efficient package manager
- **ESLint/Prettier** ✨ - Code quality and formatting
- **TypeScript** 🔍 - Static type checking
- **Next.js build system** 🏗️ - Build and optimization

## Content Rendering 🎭

- **KaTeX** ∑ - Math typesetting
- **react-syntax-highlighter** 🌈 - Code highlighting
- **cheerio** 🔍 - HTML parsing
