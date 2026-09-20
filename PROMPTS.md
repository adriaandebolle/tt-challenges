# PROMPTS — your AI trail

How you drive AI tools is part of what we assess — we *want* you using them, and we want to see how. Keep this honest and lightweight: paste or export the exchanges that mattered, as you go.

This includes the **questions you asked** — of the [context-brain/](context-brain/), of your tools about the problem itself, of us by email. An engineer interrogating "who is this for and what makes it trustworthy?" before building reads very differently from one who opened with "build the thing."

For each significant exchange, a short entry like:

```
## [time] tool: claude-code
**Asked:** paste or summarize the prompt
**Got:** one line on what came back
**Did with it:** took it / rejected it because … / redirected it by …
```

What we're reading for:

- What you **delegated** to the tool vs. kept for yourself
- Whether you **verified** its output before building on it (and how)
- Where you **overrode or redirected** it — the moments the tool was wrong and you caught it
- What you asked to **understand the customer and the problem**, not just to produce code

**Commit the raw session export too.** Claude Code, Cursor, and friends can export full session transcripts — drop them in `prompts/` as-is. **We treat the raw log as the source of truth** and this file as your annotated index on top of it. Don't sanitize the export: dead ends, tool errors, and wrong turns read as experience, not failure. A trail with no wrong turns and no timestamps reads as reconstructed — the only bad version of this file.

> **If you use Claude Code, this is already wired up for you.** A `Stop` + `SessionEnd` hook (`.claude/settings.json` → `scripts/export-transcript.sh`) copies each session's full transcript into `prompts/raw-session-<id>.jsonl` automatically — no manual export. Just commit what lands there. On another tool, export by hand into the same folder. Either way, the raw logs are yours and we read them; the hook only removes the step where you forget.

---

*(your entries start here)*

## 10:48 tool: claude-code
**Asked:** "Familiarise yourself with the complete REPO to understand this assignment fully and properly," plus pasted Zach's invite email (timebox 2–2.5h, review context-brain, don't one-shot-prompt, human stays in the loop).
**Got:** Full read of README/SPEC/STACK/DESIGN/context-brain, plus CLAUDE.md's checkpoint process — the agent is instructed to stop and ask at seven named decision points rather than default into a design. It then asked Checkpoint 1 (use case) as a multiple-choice question.
**Did with it:** Didn't answer directly — asked the agent to first lay out pros/cons per option grounded in what `context-brain/` and the actual `data/` corpus support, rather than picking from options with a one-line rationale.

## 11:02 tool: claude-code
**Asked:** For the pros/cons, the agent sampled PC1's actual source files (target-scorecards, interview-notes, leadership-assessment, 360-feedback, competency-framework, board-deck) and reported back that "comparison of candidates" has weak data support (no multi-candidate slate for any role exists in the corpus — every seat has one hired candidate) and that "exec brief" maps almost 1:1 onto the already-structured leadership-assessment fields.
**Got:** A recommendation for exec brief, with the comparison option flagged as effectively unbuildable from this corpus.
**Did with it:** Answered from my interview context instead of the corpus argument alone: "From my interview with Zack, it is clear that Team Theory focuses on executive-level hiring. These are the most difficult and financially impactful hires... I didn't find much data either to support a comparison of candidates." This confirmed comparison was out but left candidate-profile vs. exec-brief genuinely ambiguous — the agent caught that and asked a direct follow-up rather than guessing which one "executive-level hiring" meant. Picked **exec brief** on the follow-up (the ongoing monitor/retain read, not the pre-hire panel read).

## 11:09 tool: claude-code
**Asked:** Checkpoint 2 (scope cuts) came next; instead of answering in prose, proposed a process: build a WBS.md and TIMESHEET.md first, tie the WBS to SPEC's Must/Should/Could tiers, and use the arithmetic to find the real cut rather than guessing up front. Gave the actual timesheet start ("10:15–10:45: read assignment, clear Docker, new API key, git clone, VS Code, Grammarly. 10:45: start Claude Code").
**Got:** TIMESHEET.md seeded with those entries, and a first WBS.md organized by pillar (Foundations / Ingest / Converse / Generate / Dashboard / Wrap) with time estimates — which added up to ~215 minutes against the 150-minute cap even at Must-tier alone, before Should/Could.
**Did with it:** Verified the arithmetic was legible, then rejected the WBS's *shape* (see next entry) rather than accepting the pillar-based structure as-is.

## 11:16 tool: claude-code
**Asked:** Rejected the pillar-per-phase structure: "the phases should not align with the pillars... the first phases should represent creating the MVP... add placeholders for unfinished work (visually)... don't bother about timing too much, as it is more important to me to have a complete plan."
**Got:** WBS.md rewritten around build maturity instead — Phase 1 = every pillar at Must-level end-to-end (the real MVP), Phase 2 = Should-tier layered onto all four pillars, Phase 3 = Could-tier, Phase 4 = unasked-for "beyond the spec" taste — with an explicit placeholder rule (deferred features get an honest visible stub, never silent absence, tying back to DESIGN.md's "status is always visible"). Remaining CLAUDE.md checkpoints (data model, pipeline shape, grounding, trust surface, final pass) were pinned to the exact WBS tasks that trigger them.
**Did with it:** Took the restructure as-is — it matched the intent — and used it as the frame for every decision since.

## ~11:20 tool: claude-code
**Asked:** Answered the "compress a Must-tier task" question from the WBS with a concrete ingest-scope call: "We can focus initially on the MD files... The queue should exist immediately. The other files can be marked as 'failed' because the file extension is not yet supported... We are building an executive-level tool. We cannot afford mistakes."
**Got:** Logged verbatim as a DECISIONS.md entry (this doubles as the pipeline-shape checkpoint answer), plus a WBS.md edit: every file in `data/` still gets enqueued through the real MinIO+ElasticMQ path (no pre-filtering), non-`.md` files fail *that document* immediately with an explicit reason, office-format converters pushed to Phase 2.
**Did with it:** Accepted as specified — no override needed, the instruction was already concrete and matched the pipeline's "must fail visibly, not silently" requirement.

## ~11:22–11:30 tool: claude-code
**Asked:** Three further checkpoints in quick succession, each posed as a multiple-choice question by the agent with an explicit trade-off framing: (1) data model/isolation — app-level `org_id` filtering vs. Postgres RLS enabled from the first migration; (2) grounding strategy — pure vector RAG vs. exec-scoped structured retrieval (fetch every chunk tagged to the named executive across doc types) for Generate; (3) trust surface — citations-only MVP vs. citations plus pass-through of the signal/confidence and deviation flags the source docs already compute.
**Got:** Each answered by picking the stronger (more work, more defensible) option: RLS-now, exec-scoped structured retrieval, and citations-plus-signal/deviation-flags respectively — each one justified by the same standing principle: "executive-level tool, cannot afford mistakes."
**Did with it:** Logged each verbatim in DECISIONS.md as its own decision block, and propagated each into the WBS.md tasks it touches so the plan and the decision log don't drift apart.

## ~11:32 tool: claude-code
**Asked:** Flagged that PROMPTS.md hadn't been kept current even though the raw transcript was landing in `prompts/` via the auto-export hook, and asked for regular commits going forward for transparency.
**Got:** This backfilled index (the entries above), reconstructed from the raw session transcript and this conversation rather than written live — noted here honestly rather than presented as if it had been kept turn-by-turn. Going forward the plan is to keep this updated as decisions happen, not in a batch like this one.
**Did with it:** Committed the planning artifacts (`8a22080`).

## ~11:35 tool: claude-code
**Asked:** "Great, that's more transparent and readable... This should be logged into our TIMESHEET, marked as done in the WBS. Then, after a step, I verify the changed files, and we commit... I have control over each step/commit." Established the review-before-commit workflow.
**Got:** WBS Phase 0 and the five resolved checkpoints marked `[x]`; every unbuilt implementation task left `[ ]` rather than marked done prematurely. Full diff shown before committing (`e1ae631`).
**Did with it:** Reviewed the diff, approved, committed.

## ~11:40–12:05 tool: claude-code
**Asked:** "commit and let's continue with the data migrations and further setup" — moved to WBS 1.0 Foundations.
**Got:** Scaffolded `api/` (Node+TS, Hono/pg/AWS-SDK/Xenova deps), wrote the Postgres migration (orgs/documents/chunks/generated_documents/executives/citations, RLS policies, `app_current_org_ids()`), a migration runner, and a MinIO+ElasticMQ bootstrap script; wired both into `make up`.
**Did with it:** Two real bugs surfaced and were fixed before moving on, not glossed over:
1. `docker.io/minio/minio` now requires Docker Hub auth (a real distribution change) — pull failed on first `make up`. Switched to `quay.io/minio/minio`, verified the pull succeeds.
2. `make up` ran clean, but a manual cross-tenant RLS probe (insert as one portco, try to read/write as another) showed isolation **did nothing** — `brain` (the compose bootstrap role) is a Postgres superuser, and superusers bypass RLS unconditionally, `FORCE ROW LEVEL SECURITY` notwithstanding. This would have been an invisible, catastrophic bug — every RLS policy present and "correct," isolation completely absent — exactly the failure mode `05-talent-review.md` warns about (everything shows green, the output is wrong). Fixed by adding a least-privilege `app_user` role for all runtime queries, keeping `brain` for migrations only; re-ran the cross-tenant probe against `app_user` and confirmed isolation actually holds (no-context = 0 rows, pc2 can't see pc1's row, a cross-tenant insert is rejected by Postgres itself). Also hit a local port 5432 collision with a native Postgres on this machine — remapped the container to 5433 rather than touch the user's unrelated service.
Logged in DECISIONS.md as an implementation note and in WBS.md against 1.0 Foundations, not silently fixed and forgotten.

## ~12:10 tool: claude-code
**Asked:** "Can you create an artifact with the ERD? This makes it easier to discuss database structure." Confirmed the Docker Hub/minio fix independently ("I had the same issue... although I was logged in correctly").
**Got:** A published Claude.ai artifact diagramming the six-table schema — orgs outside an RLS boundary, org_id threading every table inside it, the executives-by-id identity-merge guard, and the generated_documents→documents loopback — plus an in-page callout about the superuser/RLS bug.
**Did with it:** Took it as-is.

## ~12:15 tool: claude-code
**Asked:** "make sure that we mark the security issues and RLS in our WBS as a follow-up task. We need to test/investigate with another normal non-super user later. Put the link in a document... add an additional section to the README... links to our (new) resources like TIMESHEET and WBS."
**Got:** A follow-up added to WBS.md 1.0 (test isolation against a second non-superuser role, automate the probe as a regression test, separately verify `citations`' subquery-based policy — not just re-asserting what's already proven for `app_user`); the ERD link recorded in DECISIONS.md and WBS.md; a new "Planning & build trail" section added to README.md linking WBS/TIMESHEET/DECISIONS/PROMPTS/the ERD, explicitly marked as candidate-added rather than part of the original brief, with a note that the artifact link is private by default.
**Did with it:** Reviewed and committed (`a897bdf`, `6c7dc76`).

## ~12:20–12:55 tool: claude-code
**Asked:** (implicit — "continue" from the prior turn) proceeded to WBS 1.1 Ingest: seed script, worker, chunking, local embeddings.
**Got:** Full pipeline built and run end to end: 30 markdown docs → `ready` with chunks, 7 office-format docs → `failed` with an explicit reason, matching the ingest-scope decision exactly.
**Did with it:** Didn't stop at "it ran" — inspected the extracted `executives` table before trusting it, and caught a real false positive: document titles ("Leadership Competency Framework — Vantage Managed Services") matched the same "Name — Role" shape the heuristic uses for real executive sections, so three document titles got ingested as if they were people — directly undermining the table's own purpose (the identity-merge guard). Fixed by only matching on a real `## ` section heading, never the document-title fallback; also cleaned role strings that had picked up "· avg 4.2" 360-feedback noise. Re-ran from a full `make reset` and re-checked the RLS cross-tenant probe against the real data, not just the earlier synthetic test rows.

## ~12:55–13:20 tool: claude-code
**Asked:** (continued autonomously per the established workflow) WBS 1.2 Converse: retrieval, the chat endpoint, Anthropic wiring.
**Got:** `POST /api/chat` — embeds the question locally, vector-searches under RLS, prompts Claude to answer only from numbered passages with `[n]` citations, parses which citations were actually used.
**Did with it:** Didn't just check the endpoint returns 200 — ran three real probes before calling it done: (1) a groundable question ("Anika Sørensen's flight risk") returned a genuinely well-cited answer spanning 8 real passages across 5 different source documents; (2) an out-of-corpus question (Vantage's stock ticker) got an honest refusal with zero citations, not a fabricated answer; (3) asking about a PC1 executive while scoped to PC2 also refused — confirming RLS isolation extends through the whole chat path (embed → vector search → Claude), not just direct table reads. All three matched what SPEC.md and DECISIONS.md's grounding-strategy checkpoint require before trusting this further.

## ~13:20 tool: claude-code
**Asked:** "Currently, we are using Anthropic. Put an additional task in the WBS (later phases) to check agents like Mistral AI and navigate with the team whether a European provider is a must for some clients or when this might become a requirement."
**Got:** A new "Open questions for the team" section in WBS.md, distinct from the build-task phases — flagged as a product/vendor decision to raise with Zach, not something to build against speculatively, and grounded it in `01-icp.md`'s note that these buyers stall on security/compliance review more than price.
**Did with it:** Took it as specified.

## ~13:20–13:50 tool: claude-code
**Asked:** (continued autonomously) WBS 1.2 Converse UI: the chat frontend.
**Got:** `web/` scaffolded (React + Vite + TanStack Query), a chat page with an org switcher and a per-answer evidence panel.
**Did with it:** The system prompt says to test UI changes in a browser rather than claim success from a clean build — did that literally: installed Playwright, drove the app in a real headless Chromium session against the live API and real corpus, and screenshotted three states (empty, grounded with 8 citations, ungrounded/"not in the knowledge base"). Caught and fixed my own test-script bug along the way — the first ungrounded screenshot was taken mid-request because my wait condition matched the "Thinking…" placeholder instead of the real response — before trusting the result.
