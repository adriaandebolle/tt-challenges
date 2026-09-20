import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchOrgs, postChat, slugToScope, type ChatResponse, type OrgScope } from "./api";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: ChatResponse["citations"];
  grounded?: boolean;
}

export default function App() {
  const { data: orgs } = useQuery({ queryKey: ["orgs"], queryFn: fetchOrgs });
  const [orgSlug, setOrgSlug] = useState<string>("daw-fund");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const scope: OrgScope = slugToScope(orgSlug);
  const activeOrg = orgs?.find((o) => o.slug === orgSlug);

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
          <h1>Converse</h1>
        </div>
        <div>
          <select
            className="org-switcher"
            value={orgSlug}
            onChange={(e) => {
              setOrgSlug(e.target.value);
              setMessages([]);
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

      <div className="thread" ref={threadRef}>
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
              <div className="answer">{m.text}</div>
              {m.citations && m.citations.length > 0 && (
                <div className="citations">
                  <span className="citations-label">Evidence</span>
                  {m.citations.map((c) => (
                    <div className="citation" key={c.index}>
                      <span className="cite-index">[{c.index}]</span>
                      <span className="cite-source">{c.sourcePath}</span>
                      {c.citationAnchor ? ` — ${c.citationAnchor}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {chatMutation.isPending && <div className="msg-assistant">Thinking…</div>}
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
    </div>
  );
}
