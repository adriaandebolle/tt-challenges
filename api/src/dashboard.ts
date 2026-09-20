import { withOrgContext } from "./db.js";

export interface DashboardData {
  statusCounts: Record<string, number>;
  failedDocuments: { id: string; sourcePath: string; statusReason: string | null; docType: string | null }[];
  recentGenerated: { id: string; title: string; executiveName: string | null; createdAt: string }[];
  totalChunks: number;
  totalExecutives: number;
}

// Pillar 4's Must: one view of what's in the KB, what the pipeline is doing,
// what's been generated. Grouped as status/failed/generated rather than a
// flat counter list — DESIGN.md's "a dashboard of vanity counters that
// answers no user question" is the thing to avoid, and this costs nothing
// extra to build over a naive version, just a different query shape.
export async function getDashboard(orgIds: string[]): Promise<DashboardData> {
  return withOrgContext(orgIds, async (client) => {
    const { rows: statusRows } = await client.query<{ status: string; count: string }>(
      `SELECT status, count(*) FROM documents GROUP BY status`,
    );
    const statusCounts: Record<string, number> = { queued: 0, processing: 0, ready: 0, failed: 0 };
    for (const row of statusRows) statusCounts[row.status] = Number(row.count);

    const { rows: failedDocuments } = await client.query(
      `SELECT id, source_path, status_reason, doc_type
       FROM documents WHERE status = 'failed'
       ORDER BY updated_at DESC`,
    );

    const { rows: recentGenerated } = await client.query(
      `SELECT d.id, gd.title, e.name AS executive_name, d.created_at
       FROM documents d
       JOIN generated_documents gd ON gd.id = d.generated_document_id
       LEFT JOIN executives e ON e.id = gd.executive_id
       WHERE d.origin = 'generated'
       ORDER BY d.created_at DESC
       LIMIT 10`,
    );

    const { rows: chunkCountRows } = await client.query<{ count: string }>(`SELECT count(*) FROM chunks`);
    const { rows: execCountRows } = await client.query<{ count: string }>(`SELECT count(*) FROM executives`);

    return {
      statusCounts,
      failedDocuments: failedDocuments.map((r) => ({
        id: r.id,
        sourcePath: r.source_path,
        statusReason: r.status_reason,
        docType: r.doc_type,
      })),
      recentGenerated: recentGenerated.map((r) => ({
        id: r.id,
        title: r.title,
        executiveName: r.executive_name,
        createdAt: r.created_at,
      })),
      totalChunks: Number(chunkCountRows[0].count),
      totalExecutives: Number(execCountRows[0].count),
    };
  });
}
