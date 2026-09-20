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

### 1.1 Ingest — Must
- [x] checkpoint: **pipeline shape** — decided in part: MVP parses `.md` only; every other file type still goes through the real queue and fails *that document* immediately with an explicit reason ("file extension not yet supported") — see [DECISIONS.md](DECISIONS.md).
- [ ] Seed/ingest path: walk **all** of `data/` (markdown + `.docx`/`.pptx`/`.xlsx` originals) → upload every file to MinIO → enqueue one job per doc, no pre-filtering.
- [ ] Worker: dequeue → if `.md`, chunk → embed → insert chunks, status ready; if not `.md`, status **failed**, reason = unsupported extension. Status always visible to the user (queued/processing/ready/failed).
- [ ] A bad file (unsupported type, malformed content) fails *that* document, visibly, with a specific reason — never the pipeline.

### 1.2 Converse — Must
- [x] checkpoint: **grounding strategy** — decided: vector RAG for Converse's open-ended questions; exec-scoped structured retrieval for Generate (see [DECISIONS.md](DECISIONS.md)). No citation, no claim, in either path.
- [ ] Chunk metadata carries `org_id`, `doc_type`, and (where applicable) `executive_name` — needed for both retrieval paths below.
- [ ] Retrieval: embed query, vector search, org/portco filter (RLS-scoped).
- [ ] Chat endpoint: grounded answer with citations that trace to a real passage; explicit "not in the corpus" path — never invents.
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

---

## Status

Planning closed 11:32 — Phase 0 done, the five checkpoints above resolved and logged verbatim in [DECISIONS.md](DECISIONS.md). Nothing in Phase 1 is implemented yet — checkboxes above track that honestly as work happens. Next up: 1.0 Foundations (the Postgres migration).
