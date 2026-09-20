import type pg from "pg";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  citationAnchor: string | null;
  docType: string | null;
  sourcePath: string;
  distance: number;
}

/** Vector RAG for Converse's open-ended questions — see DECISIONS.md's
 * grounding-strategy checkpoint. RLS (via the caller's withOrgContext) is
 * what actually restricts this to the requester's org(s); this query itself
 * has no org filter because it doesn't need one. */
export async function vectorSearch(
  client: pg.PoolClient,
  queryEmbeddingLiteral: string,
  limit = 8,
): Promise<RetrievedChunk[]> {
  const { rows } = await client.query(
    `SELECT c.id, c.document_id, c.content, c.citation_anchor, c.doc_type,
            d.source_path,
            c.embedding <=> $1::vector AS distance
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [queryEmbeddingLiteral, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    citationAnchor: r.citation_anchor,
    docType: r.doc_type,
    sourcePath: r.source_path,
    distance: Number(r.distance),
  }));
}

/** Exec-scoped structured retrieval for Generate — fetches every chunk tagged
 * to one executive, not a similarity-ranked subset. See DECISIONS.md. */
export async function chunksForExecutive(
  client: pg.PoolClient,
  executiveId: string,
): Promise<RetrievedChunk[]> {
  const { rows } = await client.query(
    `SELECT c.id, c.document_id, c.content, c.citation_anchor, c.doc_type,
            d.source_path, 0 AS distance
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.executive_id = $1
     ORDER BY d.doc_type, c.chunk_index`,
    [executiveId],
  );
  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    citationAnchor: r.citation_anchor,
    docType: r.doc_type,
    sourcePath: r.source_path,
    distance: 0,
  }));
}
