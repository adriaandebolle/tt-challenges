import pg from "pg";
import matter from "gray-matter";
import { receiveIngestJobs, deleteIngestJob } from "./queue.js";
import { withOrgContext, resolveAllOrgIds, upsertExecutive } from "./db.js";
import { getObjectText } from "./storage.js";
import { chunkMarkdown, matchExecutiveHeading } from "./chunk.js";
import { embed, toVectorLiteral } from "./embeddings.js";

interface DocumentRow {
  id: string;
  org_id: string;
  source_path: string;
  doc_type: string | null;
  file_extension: string;
  storage_key: string;
}

async function processDocument(client: pg.PoolClient, documentId: string) {
  const { rows } = await client.query<DocumentRow>(
    `SELECT id, org_id, source_path, doc_type, file_extension, storage_key
     FROM documents WHERE id = $1`,
    [documentId],
  );
  if (rows.length === 0) {
    console.warn(`document ${documentId} not found (deleted?) — skipping`);
    return;
  }
  const doc = rows[0];

  await client.query(`UPDATE documents SET status = 'processing', updated_at = now() WHERE id = $1`, [
    documentId,
  ]);

  // A bad file fails *that document*, visibly — this decision was made at
  // ingest scope (DECISIONS.md): only .md is parsed in the MVP, everything
  // else fails with an explicit reason rather than being silently skipped.
  if (doc.file_extension !== "md") {
    await client.query(
      `UPDATE documents SET status = 'failed', status_reason = $2, updated_at = now() WHERE id = $1`,
      [documentId, `file extension not yet supported: .${doc.file_extension}`],
    );
    console.log(`failed  ${doc.source_path}  (unsupported extension .${doc.file_extension})`);
    return;
  }

  try {
    const raw = await getObjectText(doc.storage_key);
    const parsed = matter(raw);
    const sections = chunkMarkdown(parsed.content);

    if (sections.length === 0) {
      throw new Error("no chunkable content found (empty or malformed markdown body)");
    }

    // Re-ingest safety: replace this document's chunks rather than append.
    await client.query(`DELETE FROM chunks WHERE document_id = $1`, [documentId]);

    let index = 0;
    for (const section of sections) {
      let executiveId: string | null = null;
      const execMatch = section.fromHeading ? matchExecutiveHeading(section.heading) : null;
      if (execMatch) {
        executiveId = await upsertExecutive(client, doc.org_id, execMatch.name, execMatch.role);
      }

      const embedding = await embed(`${section.heading}\n${section.text}`);
      await client.query(
        `INSERT INTO chunks (document_id, org_id, doc_type, executive_id, chunk_index, content, citation_anchor, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
        [
          documentId,
          doc.org_id,
          doc.doc_type,
          executiveId,
          index,
          section.text,
          section.heading,
          toVectorLiteral(embedding),
        ],
      );
      index++;
    }

    await client.query(
      `UPDATE documents SET status = 'ready', status_reason = NULL, updated_at = now() WHERE id = $1`,
      [documentId],
    );
    console.log(`ready   ${doc.source_path}  (${sections.length} chunks)`);
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await client.query(
      `UPDATE documents SET status = 'failed', status_reason = $2, updated_at = now() WHERE id = $1`,
      [documentId, message],
    );
    console.log(`failed  ${doc.source_path}  (${message})`);
  }
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(`worker started (${once ? "drain mode, exits when the queue is empty" : "continuous polling"})`);

  for (;;) {
    const allOrgIds = await resolveAllOrgIds();
    const jobs = await receiveIngestJobs(5, once ? 2 : 10);

    if (jobs.length === 0) {
      if (once) break;
      continue;
    }

    for (const { job, receiptHandle } of jobs) {
      await withOrgContext(allOrgIds, (client) => processDocument(client, job.documentId));
      await deleteIngestJob(receiptHandle);
    }
  }

  console.log("queue drained.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
