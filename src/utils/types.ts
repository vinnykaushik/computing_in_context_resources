import { ObjectId } from "mongodb";

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
  description?: string;
  sequence_position?: string;
  vector_embedding?: number[];
  content_sample?: string;
  metadata_processed?: boolean;
  file_type?: string;
  author?: string;
  university?: string;
  original_filename?: string;
  drive_id?: string;
};

export type FileContent =
  | NotebookContent
  | TextContent
  | BinaryContent
  | Record<string, unknown>;

export type NotebookContent = {
  cells?: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
};

export type TextContent = string;

export type BinaryContent = {
  data: Buffer | Uint8Array;
  mimeType?: string;
  extractedText?: string;
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
  description: string;
  sequence_position: string;
  vector_embedding: number[] | null;
  content_sample: string;
  file_type: string;
  university?: string;
  author?: string;
  original_filename?: string;
  drive_id?: string;
};

export type SearchOptions = {
  query_text?: string;
  language?: string;
  course_level?: string;
  context?: string;
  sequence_position?: string;
  file_type?: string;
};

export interface SearchFilters {
  language?: string;
  course_level?: string;
  sequence_position?: string;
  file_type?: string;
  context?: string;
}

export interface SearchResult {
  title: string;
  snippet?: string;
  score: number;
  url: string;
  language: string;
  course_level: string;
  sequence_position: string;
  context: string;
  description: string;
  cs_concepts: string;
  author?: string;
  university?: string;
  file_type?: string;
}

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

export type FilterCriteria = {
  [key: string]: unknown;
};
