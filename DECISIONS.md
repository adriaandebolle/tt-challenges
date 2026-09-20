# DECISIONS — your build log

Keep this as you go, not from memory at the end. Alongside your code and [PROMPTS.md](PROMPTS.md), it's the main thing we read. Short and honest beats polished.

> If you're building with an AI agent, it's been asked ([CLAUDE.md](CLAUDE.md)) to pause at key decision points and put the call to **you** — use case, cuts, data model, pipeline shape, grounding, the trust surface. It records your answers **verbatim**; the *"in your own words"* lines below are for **your keyboard only** — your agent has been told not to write them. To be straight about why: we don't mind who typed this file, but the thinking has to be yours, and the review is where we check — we'll probe these decisions live and cross-reference the quotes against your raw session transcript. A messy honest log beats a polished generated one, every time.

## How to run what I built

Exact steps from a clean clone. We follow these literally.

```
make up
# then …
```

## The use case I chose

**Exec brief** — a current-state leadership profile for a single executive, synthesizing the leadership assessment, 360 feedback, board-deck mentions, target scorecard, and competency framework into one grounded document: current-state score, future-state gap, 9-box, flight-risk, succession, key risks, and evidence citations per claim. It supports the ongoing monitor/retain decision (JTBD 5) that Hema owns and Dana reads at the board/IC level — the ask of a small slice of the full talent review, scoped to one exec at a time to fit the timebox.

## Decisions & trade-offs

```
### Decision: Use case — exec brief
- **The call:** Generate a current-state exec brief per executive (not a pre-hire candidate profile, not a candidate comparison).
- **Said at the time:** "From my interview with Zack, it is clear that Team Theory focuses on executive-level hiring. These are the most difficult and financially impactful hires. So, understanding this is vital. I didn't find much data either to support a comparison of candidates." — followed by selecting "Exec brief" over "Candidate profile" when asked to disambiguate between the two remaining options.
- **What I gave up:** The candidate profile (backward-looking, ties directly to a hire/no-hire call) and the candidate-comparison use case (SPEC's third option) — the corpus has no multi-candidate slate for an open role, only one candidate per already-filled seat, so a comparison would have meant inventing data not present in `data/`.
- **In your own words (typed by you, not your agent):**
```

```
### Decision: Data model & isolation — org_id FK + Postgres RLS enabled from the first migration
- **The call:** A single `orgs` table (the fund + PC1/PC2/PC3), every `documents`/`chunks`/`generated_documents` row carries an `org_id` FK, and Postgres Row-Level Security policies enforce isolation at the database layer from the first migration — not deferred as SPEC.md's listed "Could" (full enforcement), and not left to application-level `WHERE org_id = ?` filtering alone.
- **Said at the time:** Selected "org_id FK + Postgres RLS enabled now" over app-level-only filtering, on the strength of the reasoning given the turn before: "We are building an executive-level tool. We cannot afford mistakes."
- **What I gave up:** More setup time on the schema/migration before any ingest code runs, and more care needed on every connection (RLS requires the app to set/authenticate the current org context per request, not just add a `WHERE` clause) — a real cost against the 2.5h budget, taken deliberately because isolation is `context-brain/`'s stated #1 customer gate.
- **In your own words (typed by you, not your agent):**
```

```
### Decision: Grounding strategy — exec-scoped structured retrieval for Generate, vector RAG for Converse
- **The call:** Open-ended chat questions (Pillar 2) are answered with standard vector-similarity retrieval over the org's chunks. Generating an exec brief (Pillar 3) does not rely on similarity ranking alone — it explicitly fetches every chunk tagged with the named executive's identity across the relevant doc types (leadership-assessment, 360-feedback, board-deck, target-scorecard, competency-framework), so evidence coverage for the one document type that matters most is guaranteed, not probabilistic. In both paths, the standing rule holds regardless: no citation, no claim — the model states "the corpus doesn't support this" rather than filling a gap.
- **Said at the time:** Selected "Exec-scoped structured retrieval (Recommended)" over pure vector RAG.
- **What I gave up:** More retrieval-layer code to write (metadata-filtered fetch by executive name + doc_type, on top of the vector-search path already needed for Converse) — a real time cost, taken because a missed reference on an executive-level document is the exact failure mode `05-talent-review.md` calls out as worst-case (a confident, wrong or incomplete read gets acted on).
- **In your own words (typed by you, not your agent):**
```

```
### Decision: Trust surface for MVP — citations + pass-through signal/deviation flags
- **The call:** The MVP exec brief ships with per-claim citations (the non-negotiable Must) plus the signal/confidence score and any deviation/corroboration flag already computed in the source leadership-assessment (e.g. the CEO-vs-assessor disagreement on CFO retention risk) — extracted and surfaced, not recomputed by the agent. Metadata block (who/what/when/from-which-sources) and suggested next-steps are Phase 2, shown as visible "planned" placeholders in the MVP per the WBS placeholder rule, not silently missing.
- **Said at the time:** Selected "Citations + pass-through signal/deviation flags (Recommended)" over a citations-only minimum.
- **What I gave up:** Nothing significant in build time — this was chosen specifically because the signal/confidence and deviation data already exist in the source documents, so surfacing them is extraction, not new agent computation. What's deferred (metadata block, next-steps) still needs Phase 2 time.
- **In your own words (typed by you, not your agent):**
```

**Implementation note (not a checkpoint, worth recording anyway):** the first cut of this schema had RLS policies that looked correct and did nothing — `brain` (the docker-compose bootstrap role) is a Postgres superuser, and superusers bypass Row-Level Security unconditionally, `FORCE ROW LEVEL SECURITY` notwithstanding. Caught by deliberately testing cross-tenant access (inserted a doc as pc1, tried to read/write it as pc2) rather than trusting that the SQL matched the design. Fixed with a dedicated non-superuser `app_user` role — see `api/migrations/0001_init.sql` and `api/src/db.ts`. Also hit a local port collision (this machine already runs a native Postgres on 5432) and remapped the container to host port 5433 in `docker-compose.yml` — an environment fix, not a design decision.

Diagram for discussion: [Second Brain Schema (ERD)](https://claude.ai/artifact/5ZCm8PUfhYjB6C2eHwPMb9) — private link, share it from the page if reviewers need it before the call. Flagged a real follow-up in WBS.md 1.0: the cross-tenant probe only proves isolation for `app_user` specifically — testing it against a second non-superuser role, automating it as a regression test, and separately checking `citations`' subquery-based policy are still open.

```
### Decision: Ingest scope for MVP — markdown only, everything else fails visibly
- **The call:** For Phase 1 (MVP), only `.md` files are actually parsed, chunked, and embedded. Every file in `data/` — including the `.docx`/`.pptx`/`.xlsx` originals — is still enqueued through the real pipeline (the queue exists immediately, nothing is pre-filtered out of it), but non-markdown files fail *that document* immediately with an explicit, specific reason: "file extension not yet supported." Converters for office formats are deferred to Phase 2/3 of the WBS.
- **Said at the time:** "We can focus initially on the MD files. This gives us the opportunity to easily ingest data and create converters for additional documents later. The queue should exist immediately. The other files can be marked as 'failed' because the file extension is not yet supported. We should always clearly mark what needs to be done (later) and what can't be found and what can't be used. We are building an executive-level tool. We cannot afford mistakes."
- **What I gave up:** Full corpus coverage on day one — the `.docx`/`.pptx`/`.xlsx` originals in `data/portcos/*/inbox/office/` won't be searchable or citable until a converter is built. Traded for a pipeline that's real (goes through MinIO+ElasticMQ, not skipped) and fails honestly and specifically rather than silently dropping unsupported files.
- **In your own words (typed by you, not your agent):**
```

## What I cut

The parts of [SPEC.md](SPEC.md) you deliberately didn't build, and why those were the right cuts for a 2–3 hour slice. Cuts recorded here are graded as product decisions; things silently missing are graded as gaps.

## If I had another day

Two or three sentences: what you'd build next, harden, or test — and the first thing you'd ship.
