export interface MdChunk {
  heading: string;
  text: string;
  /** True only for a real "## " section heading — never the document's H1
   * title used as a fallback for content before the first "##". Document
   * titles ("Leadership Competency Framework — Vantage Managed Services")
   * match the same "X — Y" shape as an exec heading, so without this flag
   * they'd get ingested into `executives` as if they were people — exactly
   * the identity-confusion failure mode that table exists to prevent. */
  fromHeading: boolean;
}

// Executive-named sections look like "Priya Balakrishnan — CFO" or
// "Anika Sørensen — CTO  ·  avg 4.2" (360s) or "Tomás Iglesias — VP Delivery
// (interviewed 2025-03, hired 2025-04)" (interview notes). Board-deck
// headings like "p.6 — §CEO Review" start lowercase/with punctuation and
// correctly fail this regex — only a real name-shaped heading matches.
const EXEC_HEADING = /^([A-ZÀ-Ý][a-zà-ÿ'.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'.-]+)+)\s+[—-]\s+(.+)$/;

export function matchExecutiveHeading(heading: string): { name: string; role: string } | null {
  const m = heading.match(EXEC_HEADING);
  if (!m) return null;
  const role = m[2]
    .split("·")[0] // strip a trailing "· avg 4.2" (360-feedback headings)
    .replace(/\s*\(.*$/, "") // strip a trailing "(interviewed ...)" parenthetical
    .trim();
  return { name: m[1].trim(), role };
}

/**
 * Splits a markdown body into one chunk per "## " section — these documents
 * are already authored that way (one exec per section, one board-deck page
 * per section), so the section heading doubles as a real citation anchor:
 * "a reader can open the source and find the line" (SPEC.md) means the line
 * the heading is on, not an arbitrary token window.
 */
export function chunkMarkdown(body: string): MdChunk[] {
  const lines = body.split("\n");
  let title = "";
  const chunks: MdChunk[] = [];
  let heading = "";
  let sawAnyHeading = false;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length > 20) {
      chunks.push({ heading: heading || title || "Untitled", text, fromHeading: sawAnyHeading });
    }
    buf = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      heading = line.replace(/^##\s+/, "").trim();
      sawAnyHeading = true;
    } else if (line.startsWith("# ") && !title) {
      title = line.replace(/^#\s+/, "").trim();
    } else if (line.trim() === "---") {
      continue;
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}
