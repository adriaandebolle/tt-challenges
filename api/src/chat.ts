import { getAnthropic, CHAT_MODEL } from "./anthropic.js";
import { vectorSearch } from "./retrieval.js";
import { embed, toVectorLiteral } from "./embeddings.js";
import { withOrgContext } from "./db.js";

export interface Citation {
  index: number;
  sourcePath: string;
  citationAnchor: string | null;
  docType: string | null;
  content: string;
}

export interface ChatResult {
  answer: string;
  citations: Citation[];
  grounded: boolean;
}

// SPEC.md Pillar 2, non-negotiable: grounded answers with real citations, and
// an honest "I don't know" when the corpus can't support one. The passages
// are the only source of truth handed to the model — never its own
// knowledge of real PE funds, real people, or general facts.
const SYSTEM_PROMPT = `You are the Second Brain, a research assistant for DAW Capital, a private-equity fund. You answer questions ONLY using the numbered passages provided in the user message — never your own general knowledge about people, companies, or private equity. Every factual claim in your answer must end with a citation marker like [1] pointing at the passage it came from. If the passages don't contain enough to answer, say plainly that the knowledge base doesn't cover this — do not guess, infer beyond what's written, or fill a gap with plausible-sounding detail. A confident wrong answer is worse than an honest "I don't know" — that is the one failure this product cannot afford.`;

export async function answerQuestion(orgIds: string[], question: string): Promise<ChatResult> {
  const queryEmbedding = await embed(question);
  const chunks = await withOrgContext(orgIds, (client) =>
    vectorSearch(client, toVectorLiteral(queryEmbedding), 8),
  );

  if (chunks.length === 0) {
    return {
      answer: "There's nothing in the knowledge base yet to answer this from — ingest some documents first.",
      citations: [],
      grounded: false,
    };
  }

  const passagesBlock = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.sourcePath}${c.citationAnchor ? ` — ${c.citationAnchor}` : ""})\n${c.content}`,
    )
    .join("\n\n");

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Passages:\n\n${passagesBlock}\n\n---\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n");

  const usedIndices = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+)\]/g)) usedIndices.add(Number(m[1]));

  const citations: Citation[] = chunks
    .map((c, i) => ({
      index: i + 1,
      sourcePath: c.sourcePath,
      citationAnchor: c.citationAnchor,
      docType: c.docType,
      content: c.content,
    }))
    .filter((c) => usedIndices.has(c.index));

  return { answer, citations, grounded: citations.length > 0 };
}
