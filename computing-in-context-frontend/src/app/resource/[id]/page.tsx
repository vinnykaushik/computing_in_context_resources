"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
// import dynamic from "next/dynamic";
import { IpynbType } from "react-ipynb-renderer";
import NotebookRenderer from "@/components/Viewport";
import { json } from "stream/consumers";
import { stringify } from "querystring";

/* // Dynamically import IpynbRenderer to avoid SSR issues
const IpynbRenderer = dynamic(
  () =>
    import("react-ipynb-renderer").then((mod) => {
      console.log("Imported module:", mod);
      return mod.IpynbRenderer;
    }),
  { ssr: false },
); */

export default function ResultPage() {
  const { id } = useParams();
  const [resource, setResource] = useState<IpynbType>({
    cells: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchResource = async () => {
      try {
        const response = await fetch(`/api/render?id=${id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch resource");
        }
        const data = await response.json();
        setResource(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchResource();
  }, [id]);
  const jsonResource = JSON.stringify(resource, null, 2);
  console.log("Resource JSON:", jsonResource);
  if (loading) {
    return <div>Loading resource...</div>;
  }

  if (error) {
    return <div>Error {error}</div>;
  }

  if (!resource) {
    return <div>No resource found.</div>;
  }

  return (
    <div>
      <h1>Notebook Viewer</h1>
      <NotebookRenderer notebook={resource} />
    </div>
  );
}
