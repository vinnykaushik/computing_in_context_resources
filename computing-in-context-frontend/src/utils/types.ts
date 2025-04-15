import { ObjectId } from "mongodb";

// MongoDB Types
export type NotebookDocument = {
  _id?: ObjectId;
  url: string;
  title: string;
  content: NotebookContent;
  date_saved: Date;
  language?: string;
  course_level?: string;
  cs_concepts?: string;
  context?: string;
  sequence_position?: string;
  vector_embedding?: number[];
  content_sample?: string;
  metadata_processed?: boolean;
};

// Interface for Jupyter notebook content
export type NotebookContent = {
  cells?: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
};

export type NotebookCell = {
  cell_type: string;
  source: string | string[];
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: unknown[];
};

export type NotebookInfo = {
  title: string;
  language: string;
  course_level: string;
  cs_concepts: string;
  context: string;
  sequence_position: string;
  vector_embedding: number[] | null;
  content_sample: string;
};

export type SearchOptions = {
  query_text?: string;
  language?: string;
  course_level?: string;
  context?: string;
  sequence_position?: string;
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
};
