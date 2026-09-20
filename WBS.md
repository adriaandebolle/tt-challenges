# WBS — work breakdown structure

Structured by **build maturity**, not by pillar: Phase 1 is a real MVP — every pillar touched at *Must* — before any pillar goes deeper. Phase 2 layers *Should* onto all four pillars; Phase 3 layers *Could*; Phase 4 is unasked-for taste (README's "beyond the spec"). This is the complete plan, including the parts we may not reach today — see [TIMESHEET.md](TIMESHEET.md) for what actually got done and when.

Where a phase touches a [CLAUDE.md](CLAUDE.md) decision checkpoint, it's marked **🔲 checkpoint** — I stop and ask before building that task, not after.

**Placeholder rule for anything deferred out of the MVP:** it gets an honest, visible stub in the UI — never silence, never fake data. A disabled control with a label, a "not yet built" state, a listed-but-greyed dashboard tile. This follows DESIGN.md directly ("status is always visible," "the brain never bluffs") — a deferred feature that just doesn't appear reads as broken; one that's visibly marked "planned" reads as a plan.

---

## Phase 0 — Orientation & decisions ✅ *(done)*
- [x] Read README/SPEC/STACK/DESIGN/context-brain; sampled `data/` to check which use case the corpus actually supports.
- [x] checkpoint: **use case** → decided **exec brief** (see [DECISIONS.md](DECISIONS.md)).
- [x] checkpoint: **scope cuts** → closed: Phase 1 below is today's cut. Everything in Phases 2–4 is deliberately deferred, not a gap.

## Phase 1 — MVP: thin slice, Must-level, all four pillars, end to end

### 1.0 Foundations ✅ *(done, verified)*
- [x] checkpoint: **data model** — decided: `orgs` (fund + PC1/PC2/PC3) with every content row FK'd via `org_id`, isolation enforced with **Postgres RLS from the first migration** (not deferred) — see [DECISIONS.md](DECISIONS.md). This pulls SPEC's "org-scoped access enforcement" out of Phase 3/Could and into Phase 1/Must-plus.
- [x] Postgres migration (`api/migrations/0001_init.sql`): `orgs`, `documents`, `chunks` (pgvector), `generated_documents`, `executives`, `citations` — every content row FK'd to `org_id`; RLS policies scoping every table by the current org context.
- [x] App layer sets/authenticates the org context per request (`api/src/db.ts` — `withOrgContext`, `resolveOrgIds`). **Caught a real bug doing this:** the `brain` role is a Postgres superuser (default for the official image's bootstrap user), and superusers bypass RLS unconditionally regardless of `FORCE ROW LEVEL SECURITY` — my first version of this table looked correct and was completely inert. Fixed by adding a dedicated non-superuser `app_user` role that the app connects as; `brain` is now migrations-only. Verified with a real cross-tenant probe (see DECISIONS.md) before trusting it.
- [x] MinIO bucket + ElasticMQ queue bootstrap, created on `make up` (`api/scripts/bootstrap-infra.ts`, idempotent).
- [x] ERD published for discussion: [Second Brain Schema](https://claude.ai/artifact/5ZCm8PUfhYjB6C2eHwPMb9) (private link — see README's "Planning & build trail" section).
- [ ] **Follow-up (security, tracked not done):** the cross-tenant probe so far only proves isolation holds for `app_user` specifically. Before trusting this more broadly: (1) create a second, distinct non-superuser role and repeat the probe against it, to rule out anything accidentally keyed to `app_user`'s exact name/grants rather than "any non-superuser"; (2) turn the manual `psql` probe into an automated regression test (e.g. a script that asserts pc2 gets 0 rows for pc1's data) so this doesn't rely on someone remembering to re-check by hand after schema changes; (3) confirm `citations`' policy (isolation via a `chunk_id IN (...)` subquery, not a direct `org_id` column) holds under the same probe — it's the one RLS policy here that isn't a straight column comparison and deserves its own check.

### 1.1 Ingest — Must ✅ *(done, verified)*
- [x] checkpoint: **pipeline shape** — decided in part: MVP parses `.md` only; every other file type still goes through the real queue and fails *that document* immediately with an explicit reason ("file extension not yet supported") — see [DECISIONS.md](DECISIONS.md).
- [x] Seed/ingest path (`api/scripts/seed-ingest.ts`): walks **all** of `data/` (markdown + `.docx`/`.pptx`/`.xlsx` originals), uploads every file to MinIO, enqueues one ElasticMQ job per doc — no pre-filtering. Path prefix (`fund/`, `portcos/PC1/`, …) determines `org_id`.
- [x] Worker (`api/src/worker.ts`): dequeue → status `processing` → if `.md`, chunk by `## ` section (each section is its own citable unit — the heading *is* the citation anchor) → embed locally (`Xenova/all-MiniLM-L6-v2`, 384-dim, matches the schema) → insert chunks, status `ready`; if not `.md`, status `failed`, reason = unsupported extension. Ran end to end: **30 ready, 7 failed** (the 7 office-format originals), exactly matching the ingest-scope decision.
- [x] A bad file fails *that* document, visibly, with a specific reason — never the pipeline. Also true for a malformed/empty `.md` body (wrapped in try/catch, failure reason recorded, worker moves to the next message).
- [x] Executives are extracted from section headings shaped like "Name — Role" and upserted into the canonical `executives` registry (the identity-merge guard from the ERD). **Caught and fixed a real false-positive here:** a document's H1 title ("Leadership Competency Framework — Vantage Managed Services") matches the same "X — Y" shape as an executive heading, and the first pass ingested three document titles as if they were people. Fixed by only attempting the match on a real `## ` section heading, never the title-fallback chunk — re-verified after a full `make reset && make ingest`: 20 clean executives across the three portcos, no document titles, no `· avg 4.2` noise in role strings.
- [x] Re-verified RLS against the real ingested data, not just synthetic test rows: pc1-scoped sees its 8 executives only, pc2-scoped sees its 5 only (no overlap), fund-scoped correctly aggregates all 20.

### 1.2 Converse — Must *(backend done, verified; UI next)*
- [x] checkpoint: **grounding strategy** — decided: vector RAG for Converse's open-ended questions; exec-scoped structured retrieval for Generate (see [DECISIONS.md](DECISIONS.md)). No citation, no claim, in either path.
- [x] Chunk metadata carries `org_id`, `doc_type`, and `executive_id` — done in ingest (WBS 1.1).
- [x] Retrieval (`api/src/retrieval.ts`): `vectorSearch` (pgvector cosine distance, RLS-scoped via the caller's org context) for Converse; `chunksForExecutive` (no ranking, full coverage) ready for Generate.
- [x] Chat endpoint (`POST /api/chat`, `api/src/chat.ts` + `api/src/index.ts`): embeds the question locally, retrieves top-8 chunks under RLS, asks Claude (`claude-sonnet-5`) to answer *only* from the numbered passages with `[n]` citation markers, parses which passages were actually cited, returns them as structured citations. Verified against the real corpus: a grounded question (Anika Sørensen's flight risk) returned an 8-citation answer tracing to real passages (leadership-assessment, 360s, interview notes, VCP, board deck); an out-of-corpus question (stock ticker) got an honest refusal with zero citations; asking about a PC1 executive while scoped to PC2 also refused — RLS extends into chat, not just direct table reads.
- [ ] Chat UI, single-turn.

### 1.3 Generate — Must *(the heart)*
- [ ] Agent: from the chat, generate the exec brief for the named executive — retrieval is **not** similarity-only: explicitly fetch every chunk tagged to that executive across leadership-assessment/360/board-deck/scorecard/competency-framework, so coverage doesn't depend on ranking.
- [ ] Save the generated brief back into the KB — persisted, listed among the fund's documents, provenance intact.
- [x] checkpoint: **the trust surface** — decided: MVP ships citations *plus* pass-through signal/confidence score and any deviation/corroboration flag already computed in the source assessment (extraction, not new agent computation) — see [DECISIONS.md](DECISIONS.md). Metadata block and next-steps are genuinely Phase 2, stubbed per the placeholder rule.

### 1.4 Dashboard — Must
- [ ] One view: ingestion status counts, what's failed, recently generated docs — "what's in the KB, what's the pipeline doing, what's been generated."

### 1.5 Placeholders for everything deferred out of MVP
- [ ] Ingest: "add a document" control visible, labeled not-yet-wired if 2.1 isn't done.
- [ ] Converse: a visible note if multi-turn/streaming isn't live yet.
- [ ] Generate: trust-surface panel shows citations + signal/deviation flags now; metadata block and next-steps shown as "planned" placeholders, not silently absent.
- [ ] Dashboard: a listed-but-inactive tile for the "should" framing (morning question) if not yet built.

### 1.6 Wrap-for-submission — Must (README's definition of done)
- [ ] checkpoint: **final pass** — does DECISIONS.md tell the true story; does clean `make up` + documented steps actually work.
- [ ] Finalize DECISIONS.md (cuts, trade-offs, "if I had another day") and PROMPTS.md; confirm the raw transcript landed in `prompts/`.
- [ ] Clean-clone check: fresh `make up` + documented steps, from scratch.
- [ ] Commit + push.

---

## Phase 2 — Should-tier, across all four pillars
- **Ingest:** converters for the office formats that fail today — `.docx`/`.pptx`/`.xlsx` — so those documents move from "failed: unsupported extension" to ready. A user can add a new document through the product (not just the seed corpus) and watch it become available.
- **Converse:** multi-turn — the conversation carries context, since conversation is how Pillar 3 documents get made.
- **Generate:** the fuller trust surface — metadata (who/what/when/from-which-sources), flags ("only one independent reference behind this section"), confidence/signal, suggested next steps.
- **Dashboard:** reframe from raw counters to "what's new, what needs me" — the talent partner's morning question.

## Phase 3 — Could-tier, across all four pillars
- **Ingest:** re-processing a failed document; dead-letter handling. (Org-scoped access enforcement moved to Phase 1 — see [DECISIONS.md](DECISIONS.md).)
- **Converse:** streaming responses; retrieval quality beyond basics (reranking, filters).
- **Generate:** full loop — the saved brief is itself re-ingested and citable in later conversation.
- **Dashboard:** whatever a talent partner would actually want — surprise-us territory.

## Phase 4 — Beyond the spec *(taste, unasked-for)*
Only after Phases 1–3 are genuinely solid. Candidates, to be argued for (not defaulted into) in DECISIONS.md if attempted:
- A small design system / component library instead of default styling (DESIGN.md's "calm, evidentiary, expensive" register).
- Data model rethought from first principles rather than the obvious tables.
- One extra capability argued from the business case (e.g., surfacing the identity-merge / source-reliability provenance risks `05-talent-review.md` names explicitly).
- ICP/market research beyond this repo that visibly changed a call.

## Open questions for the team *(not a build task — a product/vendor decision)*
- **Model-provider sovereignty:** the AI layer is Anthropic-only right now (STACK.md's stated single permitted external dependency). Worth checking with Zach/the team whether a European provider (e.g. Mistral AI) is a hard requirement for some clients or regions — regulated EU funds may carry data-residency or sovereignty constraints an Anthropic-only architecture doesn't satisfy. `01-icp.md` notes these buyers "stall on security/compliance review... far more often than on price," so this is worth raising as a real question rather than assumed away. Not something to build against speculatively — a question to bring back before committing to a multi-provider architecture.

---

## Status

Planning closed 11:32 — Phase 0 done, the five checkpoints above resolved and logged verbatim in [DECISIONS.md](DECISIONS.md). Nothing in Phase 1 is implemented yet — checkboxes above track that honestly as work happens. Next up: 1.0 Foundations (the Postgres migration).
