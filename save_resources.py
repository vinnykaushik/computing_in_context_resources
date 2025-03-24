import json
import os
import io
import requests
import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from dotenv import load_dotenv
from pymongo import MongoClient
from urllib.parse import urlparse, parse_qs
from openai import OpenAI
from resource_links import resource_links

# Load environment variables
load_dotenv()

# OAuth scopes needed
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# Set up MongoDB connection
mongo_uri = os.getenv("MONGODB_CONNECTION_STRING")
if not mongo_uri:
    raise ValueError("Missing MONGODB_URI in environment variables")

client = MongoClient(mongo_uri)
db = client.computing_in_context
collection = db.resources

# Set up OpenAI API client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def search_notebooks(
    query_text="",
    language=None,
    course_level=None,
    context=None,
    sequence_position=None,
    limit=10,
):
    """Search notebooks by content, language, course level, context and/or sequence position"""

    # Generate embedding for the query text
    try:
        embedding_response = openai_client.embeddings.create(
            input=query_text, model="text-embedding-3-small"
        )
        query_vector = embedding_response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding for query: {e}")
        return []

    # Build the search pipeline
    search_pipeline = [
        {
            "$vectorSearch": {
                "index": "resources_vector_search",
                "path": "vector_embedding",
                "queryVector": query_vector,
                "numCandidates": 100,
                "limit": limit * 3,
            }
        }
    ]

    # Add filters if specified
    filter_conditions = []
    if language:
        filter_conditions.append({"language": language})
    if course_level:
        filter_conditions.append({"course_level": course_level})
    if context:
        filter_conditions.append({"context": {"$regex": context, "$options": "i"}})
    if sequence_position:
        filter_conditions.append({"sequence_position": sequence_position})

    if filter_conditions:
        search_pipeline.append({"$match": {"$and": filter_conditions}})

    # Add limit
    search_pipeline.append({"$limit": limit})

    # Add projection for relevant fields
    search_pipeline.append(
        {
            "$project": {
                "_id": 0,
                "url": 1,
                "language": 1,
                "course_level": 1,
                "context": 1,
                "sequence_position": 1,  # Add sequence position to results
                "cs_concepts": 1,
                "content_sample": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        }
    )

    # Execute the search
    results = list(collection.aggregate(search_pipeline))

    return results


# Example usage
def search_example():
    # Search for data science notebooks in Python at introductory level
    results = search_notebooks(
        query_text="functions and for loops",
        sequence_position="end",
        language="python",
    )

    print(f"Found {len(results)} matching notebooks:")
    for idx, result in enumerate(results, 1):
        print(f"\n{idx}. {result['url']}")
        print(f"   Language: {result['language']}")
        print(f"   Level: {result['course_level']}")
        print(f"   Context: {result['context']}")
        print(f"   Sequence Position: {result['sequence_position']}")
        print(f"   Concepts: {result['cs_concepts']}")
        print(f"   Sample: {result['content_sample'][:100]}...")
        print(f"   Score: {result.get('score', 'N/A')}")


def extract_notebook_info(notebook):
    """Extract key information from a notebook"""
    content = notebook["content"]
    text_content = ""

    # Extract all text from notebook cells
    if "cells" in content:
        for cell in content["cells"]:
            if cell["cell_type"] == "markdown":
                text_content += (
                    " ".join(cell["source"])
                    if isinstance(cell["source"], list)
                    else cell["source"]
                )
            elif cell["cell_type"] == "code":
                code = (
                    " ".join(cell["source"])
                    if isinstance(cell["source"], list)
                    else cell["source"]
                )
                text_content += f" {code}"

    # Extract language information
    try:
        language_prompt = f"""
        Determine the programming language used in this notebook content.
        Return only the language name. If multiple, separate with commas.
        Content: {text_content[:4000]}  # Truncated to fit token limits
        """

        response = openai_client.chat.completions.create(
            model="gpt-4o", messages=[{"role": "user", "content": language_prompt}]
        )

        language = response.choices[0].message.content.strip().lower()
    except Exception as e:
        print(f"Error extracting language: {e}")

    # Extract context/topic information
    try:
        context_prompt = f"""
        Identify the real-world context or topic of this notebook. 
        Examples include: insurance verification, movie theatre admission, blood donor eligibility, 
        airline systems, smartphone pricing, robotics competition, fashion rating, virtual pet game, 
        vacation planning, tuition calculation, university admissions, language games, Pac-Man game, 
        mathematical concepts.
        
        Return a brief phrase (2-5 words) that best describes the context.
        If mathematical, specify the type of math (e.g., "number theory - Armstrong numbers").
        If game-related, specify the game type (e.g., "game - Pac-Man").
        
        Content: {text_content[:4000]}  # Truncated to fit token limits
        """

        response = openai_client.chat.completions.create(
            model="gpt-4o", messages=[{"role": "user", "content": context_prompt}]
        )

        context = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error extracting context: {e}")
        context = "general programming"

    try:
        sequence_prompt = f"""
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
        
        Content: {text_content[:4000]}
        """

        response = openai_client.chat.completions.create(
            model="gpt-4o", messages=[{"role": "user", "content": sequence_prompt}]
        )

        sequence_position = response.choices[0].message.content.strip().lower()

        # Normalize response to one of our three categories
        if "beginning" in sequence_position:
            sequence_position = "beginning"
        elif "end" in sequence_position:
            sequence_position = "end"
        else:
            sequence_position = "middle"

    except Exception as e:
        print(f"Error determining sequence position: {e}")
        sequence_position = "middle"  # Default to middle if we can't determine

    # Determine course level (can be refined based on content analysis)
    # This is a simple heuristic - more sophisticated methods could be used
    intro_keywords = [
        "introduction",
        "intro",
        "basic",
        "101",
        "beginner",
        "fundamental",
        "elementary",
        "starting",
        "novice",
        "primer",
        "foundation",
        "getting started",
        "first steps",
        "tutorial",
        "learn to",
        "learning to",
        "basics of",
        "introductory",
        "beginner-friendly",
    ]
    advanced_keywords = [
        "advanced",
        "complex",
        "graduate",
        "specialized",
        "expert",
        "professional",
        "high-level",
        "sophisticated",
        "in-depth",
        "advanced topics",
        "cutting-edge",
        "research",
        "optimization",
        "deep dive",
        "mastering",
        "architecture",
        "algorithm design",
        "system design",
        "performance tuning",
        "technical deep dive",
    ]

    level = "intermediate"  # Default
    text_lower = text_content.lower()

    if any(keyword in text_lower for keyword in intro_keywords):
        level = "introductory"
    elif any(keyword in text_lower for keyword in advanced_keywords):
        level = "advanced"

    # Extract CS concepts
    # Request OpenAI to extract CS concepts
    try:
        concepts_prompt = f"""
        Extract the main Computer Science concepts from this notebook content.
        Return only 3-7 key CS concepts as a comma-separated list.
        Content: {text_content[:4000]}  # Truncated to fit token limits
        """

        response = openai_client.chat.completions.create(
            model="gpt-4o", messages=[{"role": "user", "content": concepts_prompt}]
        )

        cs_concepts = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error extracting CS concepts: {e}")
        cs_concepts = ""

    # Generate embedding for the content
    try:
        embedding_response = openai_client.embeddings.create(
            input=text_content[:8000],  # Truncate if needed
            model="text-embedding-3-small",
        )
        embedding = embedding_response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        embedding = None

    return {
        "language": language,
        "course_level": level,
        "cs_concepts": cs_concepts,
        "context": context,
        "sequence_position": sequence_position,
        "vector_embedding": embedding,
        "content_sample": text_content[:500],
    }


def update_notebooks_with_embeddings():
    """Process all notebooks and add embeddings and metadata"""
    all_notebooks = collection.find({})
    count = 0

    for notebook in all_notebooks:
        try:
            info = extract_notebook_info(notebook)

            # Update the document with new info
            collection.update_one(
                {"_id": notebook["_id"]},
                {
                    "$set": {
                        "language": info["language"],
                        "course_level": info["course_level"],
                        "cs_concepts": info["cs_concepts"],
                        "context": info["context"],
                        "sequence_position": info["sequence_position"],  # New field
                        "vector_embedding": info["vector_embedding"],
                        "content_sample": info["content_sample"],
                        "metadata_processed": True,
                    }
                },
            )

            print(f"Processed: {notebook['url']}")
            count += 1

        except Exception as e:
            print(f"Error processing notebook {notebook.get('url', 'unknown')}: {e}")

    print(f"Processed {count} notebooks with embeddings and metadata")


def get_credentials():
    """Get valid user credentials from storage or user authorization."""
    creds = None
    token_path = "token.json"

    # Check if token file exists
    if os.path.exists(token_path):
        with open(token_path, "r") as token:
            creds = Credentials.from_authorized_user_info(json.load(token))

    # If no valid credentials, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Use client_id from environment
            client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
            client_secret = os.getenv(
                "GOOGLE_OAUTH_CLIENT_SECRET"
            )  # You'll need this too

            if not client_id or not client_secret:
                raise ValueError("Missing OAuth credentials in environment variables")

            # Create client config from environment variables
            client_config = {
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
                }
            }

            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=0)

        # Save the credentials for the next run
        with open(token_path, "w") as token:
            token.write(creds.to_json())

    return creds


def fetch_colab_notebook(url):
    """Fetch the content of a Colab notebook using OAuth authentication."""
    try:
        # Extract the file ID from the Colab URL
        parsed_url = urlparse(url)
        file_id = parse_qs(parsed_url.query).get("id", [None])[0]

        if not file_id:
            # If ID not in query params, try to get it from the path
            path_parts = parsed_url.path.split("/")
            if "drive" in path_parts:
                drive_index = path_parts.index("drive")
                if len(path_parts) > drive_index + 1:
                    file_id = path_parts[drive_index + 1]

        if not file_id:
            print(f"Could not extract file ID from URL: {url}")
            return None

        # Initialize credentials and build Drive API client
        creds = get_credentials()  # You already have this function in your code
        service = build("drive", "v3", credentials=creds)

        # Get the file
        request = service.files().get_media(fileId=file_id)

        # Download the file content
        file = io.BytesIO()
        downloader = MediaIoBaseDownload(file, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()

        # Parse the notebook content as JSON
        file.seek(0)
        notebook_content = json.loads(file.read().decode("utf-8"))
        return notebook_content

    except Exception as e:
        print(f"Error fetching Colab notebook: {e}")
        return None


def fetch_github_notebook(url):
    """Fetch the content of a GitHub notebook and parse it as JSON."""
    try:
        raw_url = url.replace("github.com", "raw.githubusercontent.com").replace(
            "/blob", ""
        )
        response = requests.get(raw_url)
        response.raise_for_status()
        notebook_text = response.text

        # Parse the notebook content as JSON
        try:
            notebook_content = json.loads(notebook_text)
            return notebook_content
        except json.JSONDecodeError as e:
            print(f"Error parsing GitHub notebook as JSON: {e}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching GitHub notebook: {e}")
        return None


def save_to_mongodb(url, content):
    """Save the notebook content to MongoDB."""
    if content:
        # Make sure content is a notebook dictionary
        if not isinstance(content, dict):
            try:
                # Try to parse as JSON if it's a string
                content = json.loads(content)
            except (json.JSONDecodeError, TypeError):
                print(f"Content for {url} is not a valid notebook format")
                return

        notebook = {
            "url": url,
            "content": content,
            "date_saved": datetime.datetime.now(),
        }
        collection.insert_one(notebook)
        print(f"Saved {url} to MongoDB as .ipynb")
    else:
        print(f"Failed to save {url} to MongoDB")


def process_colab_links(colab_links):
    """Process a list of Colab links."""
    """ for link in colab_links:
        content = fetch_colab_notebook(link)
        save_to_mongodb(link, content) """


def process_github_links(github_links):
    """Process a list of GitHub links."""
    for link in github_links:
        content = fetch_github_notebook(link)
        save_to_mongodb(link, content)


def export_notebooks_from_mongodb(output_dir="downloaded_notebooks"):
    """Export all notebooks from MongoDB to .ipynb files on disk."""
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created output directory: {output_dir}")

    # Query all notebooks from MongoDB
    all_notebooks = collection.find({})
    count = 0

    for notebook in all_notebooks:
        try:
            # Extract a filename from the URL
            url = notebook["url"]
            if "colab.research.google.com" in url:
                # For Colab, use the file ID as the filename
                file_id = url.split("/")[-1]
                filename = f"colab_{file_id}.ipynb"
            elif "github.com" in url:
                # For GitHub, use the repo and filename
                parts = url.replace("https://github.com/", "").split("/")
                repo = "_".join(parts[:2])  # org_repo
                filename = f"github_{repo}_{parts[-1]}"
                if "blob" in filename:
                    # Clean up filename if it contains 'blob'
                    filename = filename.replace("blob_", "")
            else:
                # Generic fallback
                filename = f"notebook_{count}.ipynb"

            # Make sure the filename ends with .ipynb
            if not filename.endswith(".ipynb"):
                filename += ".ipynb"

            # Create full path
            filepath = os.path.join(output_dir, filename)

            # Write notebook content to file
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(notebook["content"], f, ensure_ascii=False, indent=2)

            print(f"Exported: {filepath}")
            count += 1

        except Exception as e:
            print(f"Error exporting notebook {count}: {e}")

    print(f"Exported {count} notebooks to {output_dir} directory")


def main():
    colab_links = list(
        filter(lambda x: "colab.research.google.com" in x, resource_links)
    )
    github_links = list(filter(lambda x: "github.com" in x, resource_links))

    # Process Colab links
    process_colab_links(colab_links)

    # Process GitHub links
    process_github_links(github_links)


if __name__ == "__main__":
    # main()
    # update_notebooks_with_embeddings()
    search_example()
