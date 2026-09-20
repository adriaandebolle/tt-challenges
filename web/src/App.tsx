import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  fetchOrgs,
  fetchExecutives,
  generateExecBrief,
  postChat,
  slugToScope,
  type ChatResponse,
  type GenerateResult,
  type OrgScope,
} from "./api";
import { renderMarkdownLite } from "./markdown";
import Dashboard from "./Dashboard";
import DocumentViewer from "./DocumentViewer";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: ChatResponse["citations"];
  grounded?: boolean;
}

export default function App() {
  const { data: orgs } = useQuery({ queryKey: ["orgs"], queryFn: fetchOrgs });
  const [tab, setTab] = useState<"converse" | "dashboard">("converse");
  const [orgSlug, setOrgSlug] = useState<string>("daw-fund");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const scope: OrgScope = slugToScope(orgSlug);
  const activeOrg = orgs?.find((o) => o.slug === orgSlug);

  const { data: executives } = useQuery({
    queryKey: ["executives", scope],
    queryFn: () => fetchExecutives(scope),
  });
  const [executiveId, setExecutiveId] = useState<string>("");
  const [brief, setBrief] = useState<GenerateResult | null>(null);
  const [viewerDoc, setViewerDoc] = useState<{ documentId: string; anchor: string | null } | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => generateExecBrief(scope, executiveId),
    onSuccess: (result) => setBrief(result),
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) => postChat(scope, message),
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer,
          citations: result.citations,
          grounded: result.grounded,
        },
      ]);
    },
    onError: (err: Error) => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${err.message}`, grounded: false },
      ]);
    },
  });

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    chatMutation.mutate(text);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <span className="eyebrow">The Second Brain</span>
          <div className="tabs">
            <button
              type="button"
              className={tab === "converse" ? "tab-active" : ""}
              onClick={() => setTab("converse")}
            >
              Converse
            </button>
            <button
              type="button"
              className={tab === "dashboard" ? "tab-active" : ""}
              onClick={() => setTab("dashboard")}
            >
              Dashboard
            </button>
          </div>
        </div>
        <div>
          <select
            className="org-switcher"
            value={orgSlug}
            onChange={(e) => {
              setOrgSlug(e.target.value);
              setMessages([]);
              setExecutiveId("");
              setBrief(null);
            }}
          >
            {(orgs ?? []).map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.kind === "fund" ? `${o.name} (fund-wide)` : o.name}
              </option>
            ))}
          </select>
          <p className="scope-note">
            {activeOrg?.kind === "fund"
              ? "Sees the fund's own documents plus all three portcos."
              : "Scoped to this portco only — cannot see other portcos' data."}
          </p>
        </div>
      </header>

      {tab === "dashboard" ? (
        <Dashboard scope={scope} orgName={activeOrg?.name ?? "…"} />
      ) : (
        <>
      <div className="generate-panel">
        <select
          className="org-switcher"
          value={executiveId}
          onChange={(e) => setExecutiveId(e.target.value)}
        >
          <option value="">Generate a brief for…</option>
          {(executives ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.role ? ` — ${e.role}` : ""}
              {activeOrg?.kind === "fund" ? ` (${e.org_name})` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={!executiveId || generateMutation.isPending}
        >
          {generateMutation.isPending ? "Generating…" : "Generate exec brief"}
        </button>
        {generateMutation.isError && (
          <span className="error-banner">{(generateMutation.error as Error).message}</span>
        )}
      </div>

      <div className="scroll-area" ref={threadRef}>
      {brief && (
        <div className="brief-card">
          <div className="brief-header">
            <div>
              <span className="eyebrow">Generated · saved to the knowledge base</span>
              <h2>{brief.title}</h2>
            </div>
            <button type="button" className="brief-close" onClick={() => setBrief(null)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="trust-surface">
            {brief.signalScore !== null && (
              <span className="trust-chip">Signal: {brief.signalScore.toFixed(2)}</span>
            )}
            {brief.deviationFlag && <span className="trust-chip flag">⚑ {brief.deviationFlag}</span>}
            <span className="trust-chip muted">Metadata block, next-steps checklist — Phase 2 (see WBS.md)</span>
          </div>

          <div className="brief-body" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(brief.content) }} />

          {(() => {
            // Group by claim: the backend emits one row per (claim, cited
            // index) pair, which is right for the data model but reads as
            // near-duplicate noise if shown flat — group so each claim
            // appears once with all the passages that back it.
            const byClaim = new Map<string, typeof brief.citations>();
            for (const c of brief.citations) {
              const existing = byClaim.get(c.claimExcerpt) ?? [];
              existing.push(c);
              byClaim.set(c.claimExcerpt, existing);
            }
            return (
              <div className="citations">
                <span className="citations-label">Evidence ({byClaim.size} claims cited)</span>
                {[...byClaim.entries()].map(([claim, cites], i) => (
                  <div className="citation" key={i}>
                    <p className="claim-text">{claim}</p>
                    <div className="claim-sources">
                      {cites.map((c) => (
                        <button
                          type="button"
                          className="cite-tag"
                          key={c.index}
                          onClick={() =>
                            setViewerDoc({ documentId: c.sourceDocumentId, anchor: c.citationAnchor })
                          }
                        >
                          [{c.index}] {c.sourcePath}
                          {c.citationAnchor ? ` — ${c.citationAnchor}` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <div className="thread">
        {messages.length === 0 && (
          <p className="empty-state">
            Ask a question grounded in {activeOrg?.name ?? "the knowledge base"}'s ingested documents —
            e.g. "What is the CTO's flight risk?" Each answer cites the passages it came from, and if the
            documents don't cover something, that's what you'll be told, not a guess.
            <br />
            <br />
            Note: this MVP answers each question independently — it doesn't yet carry context from earlier
            turns in the conversation (a Should-tier item, tracked in WBS.md).
          </p>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg-user">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`msg-assistant${m.grounded === false ? " ungrounded" : ""}`}>
              {m.grounded === false && <span className="not-found-tag">Not in the knowledge base</span>}
              <div className="answer brief-body" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(m.text) }} />
              {m.citations && m.citations.length > 0 && (
                <div className="citations">
                  <span className="citations-label">Evidence</span>
                  {m.citations.map((c) => (
                    <div className="citation" key={c.index}>
                      <span className="cite-index">[{c.index}]</span>
                      <button
                        type="button"
                        className="cite-link"
                        onClick={() => setViewerDoc({ documentId: c.documentId, anchor: c.citationAnchor })}
                      >
                        {c.sourcePath}
                        {c.citationAnchor ? ` — ${c.citationAnchor}` : ""}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {chatMutation.isPending && <div className="msg-assistant">Thinking…</div>}
      </div>
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${activeOrg?.name ?? "…"}`}
          disabled={chatMutation.isPending}
        />
        <button type="submit" disabled={chatMutation.isPending || !input.trim()}>
          Ask
        </button>
      </form>
        </>
      )}

      {viewerDoc && (
        <DocumentViewer
          scope={scope}
          documentId={viewerDoc.documentId}
          highlightAnchor={viewerDoc.anchor}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}
