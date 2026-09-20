import { getAnthropic, CHAT_MODEL } from "./anthropic.js";
import { chunksForExecutive, type RetrievedChunk } from "./retrieval.js";
import { withOrgContext } from "./db.js";

export interface GenerateResult {
  documentId: string;
  generatedDocumentId: string;
  title: string;
  content: string;
  signalScore: number | null;
  deviationFlag: string | null;
  executiveName: string;
  executiveRole: string | null;
  citations: { index: number; sourceDocumentId: string; sourcePath: string; citationAnchor: string | null; docType: string | null; claimExcerpt: string }[];
}

// Extraction, not new computation (DECISIONS.md's trust-surface checkpoint):
// these numbers already exist in the source leadership-assessment prose —
// pulled out with a regex against the raw chunk text, not asked of the model,
// because a number the model has to reproduce from memory is a number that
// can drift. "Signal: High (0.84)." / "Deviation (stakeholder contradiction): ..."
function extractSignalScore(chunks: RetrievedChunk[]): number | null {
  for (const c of chunks) {
    const m = c.content.match(/Signal:\s*\w+\s*\(([\d.]+)\)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function extractDeviationFlag(chunks: RetrievedChunk[]): string | null {
  for (const c of chunks) {
    // Source text is often "**Deviation (...):** text" — the bold markers
    // sit right after the colon, so without stripping them here they leak
    // into the extracted flag verbatim (caught by inspecting real output).
    const m = c.content.match(/Deviation \(([^)]+)\):\s*\**\s*(.+)/);
    if (m) return `${m[1]}: ${m[2].replace(/\*+/g, "").trim()}`;
  }
  return null;
}

const SYSTEM_PROMPT = `You write executive briefs for DAW Capital's talent partner and the deal partners she answers to — people who will quote this document in an investment-committee meeting. Use ONLY the numbered passages provided; never your own knowledge. Every factual claim ends with a citation marker like [1]. Structure the brief with these Markdown headings, in this order: "## Current state", "## Key strengths", "## Key risks", "## Flight risk & retention", "## Succession", "## Recommended next steps". If the passages don't cover a section (e.g. no succession information at all), write "Not enough evidence in the corpus to assess this" under that heading instead of inventing content — an honest gap is more valuable than a filled-in one.`;

export async function generateExecBrief(executiveId: string, orgIds: string[]): Promise<GenerateResult> {
  return withOrgContext(orgIds, async (client) => {
    const { rows: execRows } = await client.query<{ id: string; org_id: string; name: string; role: string | null }>(
      `SELECT id, org_id, name, role FROM executives WHERE id = $1`,
      [executiveId],
    );
    if (execRows.length === 0) throw new Error("Executive not found (or not visible in this scope)");
    const exec = execRows[0];

    const chunks = await chunksForExecutive(client, executiveId);
    if (chunks.length === 0) throw new Error(`No ingested evidence found for ${exec.name}`);

    const signalScore = extractSignalScore(chunks);
    const deviationFlag = extractDeviationFlag(chunks);

    const passagesBlock = chunks
      .map(
        (c, i) =>
          `[${i + 1}] (${c.sourcePath}${c.citationAnchor ? ` — ${c.citationAnchor}` : ""})\n${c.content}`,
      )
      .join("\n\n");

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Executive: ${exec.name} (${exec.role ?? "role unknown"})\n\nPassages:\n\n${passagesBlock}\n\n---\n\nWrite the executive brief.`,
        },
      ],
    });

    const content = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n");

    // Claim-level citations, not just "these sources were used somewhere":
    // each line carrying a [n] marker is treated as its own claim, tied to
    // every chunk it cites — the "evidence per claim" trust-surface item.
    const citationRows: { chunkIndex: number; claimExcerpt: string }[] = [];
    for (const line of content.split("\n")) {
      const indices = [...line.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      if (indices.length === 0) continue;
      const claimExcerpt = line.replace(/\s*\[\d+\]/g, "").trim();
      if (!claimExcerpt) continue;
      for (const idx of indices) citationRows.push({ chunkIndex: idx, claimExcerpt });
    }

    const title = `Executive Brief — ${exec.name}${exec.role ? ` (${exec.role})` : ""}`;

    const { rows: genRows } = await client.query<{ id: string }>(
      `INSERT INTO generated_documents (org_id, doc_type, executive_id, title, content, signal_score)
       VALUES ($1, 'exec-brief', $2, $3, $4, $5)
       RETURNING id`,
      [exec.org_id, exec.id, title, content, signalScore],
    );
    const generatedDocumentId = genRows[0].id;

    const { rows: docRows } = await client.query<{ id: string }>(
      `INSERT INTO documents (org_id, origin, doc_type, file_extension, status, generated_document_id)
       VALUES ($1, 'generated', 'exec-brief', 'md', 'ready', $2)
       RETURNING id`,
      [exec.org_id, generatedDocumentId],
    );
    const documentId = docRows[0].id;

    const citations: GenerateResult["citations"] = [];
    for (const row of citationRows) {
      const chunk = chunks[row.chunkIndex - 1];
      if (!chunk) continue; // model cited a passage number that doesn't exist — drop it, don't guess
      await client.query(
        `INSERT INTO citations (generated_document_id, chunk_id, claim_excerpt) VALUES ($1, $2, $3)`,
        [generatedDocumentId, chunk.id, row.claimExcerpt],
      );
      citations.push({
        index: row.chunkIndex,
        sourceDocumentId: chunk.documentId,
        sourcePath: chunk.sourcePath,
        citationAnchor: chunk.citationAnchor,
        docType: chunk.docType,
        claimExcerpt: row.claimExcerpt,
      });
    }

    return {
      documentId,
      generatedDocumentId,
      title,
      content,
      signalScore,
      deviationFlag,
      executiveName: exec.name,
      executiveRole: exec.role,
      citations,
    };
  });
}
