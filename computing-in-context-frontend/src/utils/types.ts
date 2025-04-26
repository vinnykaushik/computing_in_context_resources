import { ObjectId } from "mongodb";

// MongoDB Types
export type ResourceDocument = {
  _id?: ObjectId;
  url: string;
  title: string;
  content: FileContent;
  date_saved: Date;
  language?: string;
  course_level?: string;
  cs_concepts?: string;
  context?: string;
  sequence_position?: string;
  vector_embedding?: number[];
  content_sample?: string;
  metadata_processed?: boolean;
  file_type?: string;
};

// For backward compatibility, keep NotebookDocument type
export type NotebookDocument = ResourceDocument;

// Generic type for file content
export type FileContent =
  | NotebookContent
  | TextContent
  | BinaryContent
  | Record<string, unknown>;

// Interface for Jupyter notebook content
export type NotebookContent = {
  cells?: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
};

// Interface for text-based content
export type TextContent = string;

// Interface for binary content
export type BinaryContent = {
  data: Uint8Array | Buffer;
  mimeType?: string;
};

export type NotebookCell = {
  cell_type: string;
  source: string | string[];
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: unknown[];
};

export type FileInfo = {
  title: string;
  language: string;
  course_level: string;
  cs_concepts: string;
  context: string;
  sequence_position: string;
  vector_embedding: number[] | null;
  content_sample: string;
  file_type: string;
  university?: string;
  author?: string;
  original_filename?: string;
  drive_id?: string;
};

// For backward compatibility, keep NotebookInfo type
export type NotebookInfo = FileInfo;

export type SearchOptions = {
  query_text?: string;
  language?: string;
  course_level?: string;
  context?: string;
  sequence_position?: string;
  file_type?: string;
};

export type SearchResult = {
  url: string;
  language?: string;
  course_level?: string;
  context?: string;
  sequence_position?: string;
  cs_concepts?: string;
  content_sample?: string;
  score?: number;
  file_type?: string;
  title?: string;
};

// Google Drive file information
export type DriveFileInfo = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: number;
  iconLink?: string;
};

export interface WebhookPayload {
  secret: string;
  processAll?: boolean;
  fileIds?: string[];
}

// MongoDB query filter type
export type FilterCriteria = {
  [key: string]: any;
};
