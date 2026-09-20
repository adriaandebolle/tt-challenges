// Deliberately not a library dependency: the generated briefs only ever use
// a small, known subset of Markdown (## headings, **bold**, "- " bullets,
// [n] citation markers), and DESIGN.md wants generated documents to read
// like real documents rather than raw preformatted text.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderMarkdownLite(md: string): string {
  const lines = escapeHtml(md).split("\n");
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      closeList();
      html += `<h3>${line.slice(3)}</h3>`;
    } else if (/^(-|\d+\.)\s/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${line.replace(/^(-|\d+\.)\s/, "")}</li>`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${line}</p>`;
    }
  }
  closeList();

  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d+)\]/g, '<sup class="cite-marker">[$1]</sup>');
}
