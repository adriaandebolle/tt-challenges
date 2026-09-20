const API_BASE = "/api";

export interface Org {
  slug: string;
  name: string;
  kind: "fund" | "portco";
}

export type OrgScope = "fund" | "pc1" | "pc2" | "pc3";

export function slugToScope(slug: string): OrgScope {
  const map: Record<string, OrgScope> = {
    "daw-fund": "fund",
    "pc1-vantage": "pc1",
    "pc2-cascade": "pc2",
    "pc3-ridgeline": "pc3",
  };
  const scope = map[slug];
  if (!scope) throw new Error(`Unknown org slug: ${slug}`);
  return scope;
}

export async function fetchOrgs(): Promise<Org[]> {
  const res = await fetch(`${API_BASE}/orgs`);
  if (!res.ok) throw new Error("Failed to load orgs");
  return res.json();
}

export interface Citation {
  index: number;
  sourcePath: string;
  citationAnchor: string | null;
  docType: string | null;
  content: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  grounded: boolean;
}

export async function postChat(orgScope: OrgScope, message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgScope, message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Chat request failed");
  }
  return res.json();
}

export interface DocumentRow {
  id: string;
  source_path: string;
  doc_type: string | null;
  file_extension: string;
  status: "queued" | "processing" | "ready" | "failed";
  status_reason: string | null;
  origin: "ingested" | "generated";
  created_at: string;
  updated_at: string;
  org_slug: string;
}

export async function fetchDocuments(orgScope: OrgScope): Promise<DocumentRow[]> {
  const res = await fetch(`${API_BASE}/documents?orgScope=${orgScope}`);
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}
