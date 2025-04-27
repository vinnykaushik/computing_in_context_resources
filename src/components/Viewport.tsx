import React from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { marked } from "marked";
import "./NotebookRenderer.css"; // Import the CSS file for styling

interface NotebookCell {
  cell_type: "markdown" | "code" | string;
  source: string[];
}

interface Notebook {
  cells: NotebookCell[];
}

const NotebookRenderer = ({ notebook }: { notebook: Notebook }) => {
  if (!notebook || !notebook.cells) {
    return <p>Invalid notebook format</p>;
  }

  return (
    <div className="notebook-container">
      {notebook.cells.map((cell, index) => {
        if (cell.cell_type === "markdown") {
          return (
            <div
              key={index}
              className="markdown-cell"
              dangerouslySetInnerHTML={{ __html: marked(cell.source.join("")) }}
            />
          );
        } else if (cell.cell_type === "code") {
          return (
            <div key={index} className="code-cell">
              <SyntaxHighlighter language="python">
                {cell.source.join("")}
              </SyntaxHighlighter>
            </div>
          );
        } else {
          return <p key={index}>Unsupported cell type: {cell.cell_type}</p>;
        }
      })}
    </div>
  );
};

export default NotebookRenderer;
