import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDocumentContent, type OrgScope } from "./api";
import { renderMarkdownLite } from "./markdown";

export default function DocumentViewer({
  scope,
  documentId,
  highlightAnchor,
  onClose,
}: {
  scope: OrgScope;
  documentId: string;
  highlightAnchor?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["document-content", scope, documentId],
    queryFn: () => fetchDocumentContent(scope, documentId),
  });
  const bodyRef = useRef<HTMLDivElement>(null);

  // The chunk's citation_anchor was set to the exact "## " heading text at
  // ingest time (see api/src/worker.ts), so it should match one heading in
  // this same document exactly — scroll to it and mark it, rather than
  // leaving the reader to hunt for the passage in a long document.
  useEffect(() => {
    if (!data || !bodyRef.current || !highlightAnchor) return;
    const headings = bodyRef.current.querySelectorAll("h3");
    let match: Element | null = null;
    for (const h of headings) {
      if (h.textContent?.trim() === highlightAnchor.trim()) {
        match = h;
        break;
      }
    }
    if (!match) {
      for (const h of headings) {
        if (h.textContent && highlightAnchor.includes(h.textContent.trim())) {
          match = h;
          break;
        }
      }
    }
    if (match) {
      match.classList.add("anchor-hit");
      match.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [data, highlightAnchor]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="brief-header">
          <span className="eyebrow">{data?.docType ?? "Source document"}</span>
          <button type="button" className="brief-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {isLoading && <p className="empty-state">Loading…</p>}
        {error && <p className="error-banner">{(error as Error).message}</p>}
        {data && (
          <>
            <h2 className="modal-title">{data.sourcePath}</h2>
            <div
              ref={bodyRef}
              className="brief-body modal-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(data.content) }}
            />
          </>
        )}
      </div>
    </div>
  );
}
