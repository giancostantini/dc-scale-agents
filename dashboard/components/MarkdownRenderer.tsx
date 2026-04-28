"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  /** Si true, achica los headings 1 nivel (h1 → h2, h2 → h3, etc.) para
   *  cuando el componente está embebido dentro de una página que ya tiene
   *  su propio h1. Default false. */
  shiftHeadings?: boolean;
}

/**
 * Wrapper sobre react-markdown con estilos consistentes con el dashboard.
 * Soporta GFM (tables, strikethrough, task lists). NO permite HTML raw
 * por seguridad — solo markdown.
 */
export default function MarkdownRenderer({
  content,
  shiftHeadings = false,
}: MarkdownRendererProps) {
  return (
    <div className="md-render">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: shiftHeadings
            ? ({ children }) => <h2>{children}</h2>
            : ({ children }) => <h1>{children}</h1>,
          h2: shiftHeadings
            ? ({ children }) => <h3>{children}</h3>
            : ({ children }) => <h2>{children}</h2>,
          h3: shiftHeadings
            ? ({ children }) => <h4>{children}</h4>
            : ({ children }) => <h3>{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
      <style jsx>{`
        .md-render :global(h1) {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 32px 0 16px;
          color: var(--deep-green);
        }
        .md-render :global(h2) {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.015em;
          margin: 28px 0 12px;
          color: var(--deep-green);
        }
        .md-render :global(h3) {
          font-size: 15px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 20px 0 8px;
          color: var(--sand-dark);
        }
        .md-render :global(h4) {
          font-size: 13px;
          font-weight: 600;
          margin: 16px 0 6px;
          color: var(--text-muted);
        }
        .md-render :global(p) {
          font-size: 14px;
          line-height: 1.7;
          color: var(--deep-green);
          margin: 10px 0;
        }
        .md-render :global(ul),
        .md-render :global(ol) {
          font-size: 14px;
          line-height: 1.7;
          padding-left: 22px;
          margin: 10px 0;
          color: var(--deep-green);
        }
        .md-render :global(li) {
          margin: 4px 0;
        }
        .md-render :global(strong) {
          color: var(--deep-green);
          font-weight: 700;
        }
        .md-render :global(em) {
          font-style: italic;
        }
        .md-render :global(code) {
          font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          padding: 2px 6px;
          background: var(--off-white);
          border-radius: 3px;
        }
        .md-render :global(pre) {
          font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          padding: 14px 16px;
          background: var(--off-white);
          border-left: 3px solid var(--sand);
          overflow-x: auto;
          margin: 12px 0;
        }
        .md-render :global(pre code) {
          background: none;
          padding: 0;
        }
        .md-render :global(blockquote) {
          border-left: 3px solid var(--sand);
          padding: 4px 14px;
          margin: 12px 0;
          color: var(--text-muted);
          font-style: italic;
        }
        .md-render :global(table) {
          border-collapse: collapse;
          width: 100%;
          margin: 14px 0;
          font-size: 13px;
        }
        .md-render :global(th),
        .md-render :global(td) {
          border: 1px solid rgba(10, 26, 12, 0.1);
          padding: 8px 12px;
          text-align: left;
        }
        .md-render :global(th) {
          background: var(--off-white);
          font-weight: 600;
          color: var(--deep-green);
        }
        .md-render :global(a) {
          color: var(--deep-green);
          text-decoration: underline;
        }
        .md-render :global(hr) {
          border: none;
          border-top: 1px solid rgba(10, 26, 12, 0.1);
          margin: 24px 0;
        }
      `}</style>
    </div>
  );
}
