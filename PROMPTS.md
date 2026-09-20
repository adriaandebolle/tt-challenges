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
**Did with it:** In progress — first commit being made now to establish a real cadence instead of one large commit at the end.
