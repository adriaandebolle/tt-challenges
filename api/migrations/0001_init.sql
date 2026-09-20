-- 0001_init.sql — orgs, provenance, chunks, generated documents, citations.
--
-- Isolation is enforced here, not in application `if` statements (STACK.md #1):
-- every content table carries org_id and has Row-Level Security FORCED — even
-- the table owner cannot read across orgs without the app explicitly setting
-- the org context for the request (see app_current_org_ids() below). With no
-- context set, every RLS'd table returns zero rows: fail closed, not open.
--
-- IMPORTANT: Postgres superusers bypass RLS unconditionally — FORCE ROW LEVEL
-- SECURITY does not override that. The docker-compose `brain` role is the
-- image's bootstrap user and IS a superuser (verified: rolsuper = t), so it
-- must never be the runtime connection for the app. This migration creates a
-- separate, non-superuser `app_user` role for exactly that reason: `brain`
-- runs migrations (needs DDL), `app_user` runs every query the API makes
-- (see api/src/db.ts) and is the role RLS actually constrains.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE org_kind AS ENUM ('fund', 'portco');
CREATE TYPE document_status AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE document_origin AS ENUM ('ingested', 'generated');

-- ---------------------------------------------------------------------------
-- Tenant directory. Not RLS'd: this is the list of tenants, not tenant
-- content — a portco's name isn't the sensitive part, its documents are.
-- ---------------------------------------------------------------------------
CREATE TABLE orgs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,        -- 'daw-fund', 'pc1-vantage', 'pc2-cascade', 'pc3-ridgeline'
  name       TEXT NOT NULL,
  kind       org_kind NOT NULL,
  fund_id    UUID REFERENCES orgs(id),    -- set on a portco, pointing at its fund; null on the fund itself
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Executives are a canonical registry per portco, referenced by id from
-- chunks/generated docs rather than matched by free-text name string. This
-- directly guards against the "identity merge" failure mode 05-talent-review.md
-- names explicitly (two similarly-named execs collapsed into one record).
CREATE TABLE executives (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- ---------------------------------------------------------------------------
-- Every row below carries org_id and is RLS-isolated by it.
-- ---------------------------------------------------------------------------
CREATE TABLE generated_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL DEFAULT 'exec-brief',
  executive_id UUID REFERENCES executives(id),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,             -- the generated markdown brief
  signal_score NUMERIC(3,2),              -- pass-through confidence from the source assessment (e.g. 0.86)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  origin               document_origin NOT NULL DEFAULT 'ingested',
  source_path          TEXT,              -- relative path under data/, or an upload filename; null for generated docs
  doc_type             TEXT,              -- from frontmatter: leadership-assessment, 360-feedback, board-deck, ...
  file_extension       TEXT NOT NULL,
  storage_key          TEXT,              -- MinIO object key; null for generated docs stored only as content
  status               document_status NOT NULL DEFAULT 'queued',
  status_reason        TEXT,              -- populated on failed, e.g. "file extension not yet supported: .docx"
  generated_document_id UUID REFERENCES generated_documents(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, source_path)
);

CREATE TABLE chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,   -- denormalized from documents, for RLS + fast retrieval filter
  doc_type         TEXT,                  -- denormalized from documents
  executive_id     UUID REFERENCES executives(id),   -- set when a chunk is clearly about one named executive
  chunk_index      INT NOT NULL,
  content          TEXT NOT NULL,
  citation_anchor  TEXT,                  -- e.g. "board deck p.8 §Operations", or a section heading for docs without page anchors
  embedding        VECTOR(384),           -- Xenova/all-MiniLM-L6-v2, run locally — see DECISIONS.md
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE citations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_document_id  UUID NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  chunk_id               UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  claim_excerpt          TEXT NOT NULL,   -- the sentence/claim in the generated doc this citation backs
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON executives (org_id);
CREATE INDEX ON documents (org_id);
CREATE INDEX ON documents (status);
CREATE INDEX ON chunks (org_id);
CREATE INDEX ON chunks (document_id);
CREATE INDEX ON chunks (executive_id);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON generated_documents (org_id);
CREATE INDEX ON citations (generated_document_id);

-- ---------------------------------------------------------------------------
-- Isolation. app.current_org_ids is a per-request/transaction session
-- variable (SET LOCAL) — a comma-separated list of org UUIDs the current
-- request is allowed to see. A fund-scoped request sets the fund's id plus
-- every portco under it; a portco-scoped request sets only that one id.
-- Unset or empty => sees nothing. See api/src/db.ts (withOrgContext).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_org_ids() RETURNS UUID[] AS $$
  SELECT CASE
    WHEN current_setting('app.current_org_ids', true) IS NULL
      OR current_setting('app.current_org_ids', true) = ''
    THEN ARRAY[]::UUID[]
    ELSE string_to_array(current_setting('app.current_org_ids', true), ',')::UUID[]
  END;
$$ LANGUAGE sql STABLE;

ALTER TABLE executives ENABLE ROW LEVEL SECURITY;
ALTER TABLE executives FORCE ROW LEVEL SECURITY;
CREATE POLICY executives_isolation ON executives
  FOR ALL USING (org_id = ANY (app_current_org_ids()))
  WITH CHECK (org_id = ANY (app_current_org_ids()));

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_isolation ON documents
  FOR ALL USING (org_id = ANY (app_current_org_ids()))
  WITH CHECK (org_id = ANY (app_current_org_ids()));

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY chunks_isolation ON chunks
  FOR ALL USING (org_id = ANY (app_current_org_ids()))
  WITH CHECK (org_id = ANY (app_current_org_ids()));

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY generated_documents_isolation ON generated_documents
  FOR ALL USING (org_id = ANY (app_current_org_ids()))
  WITH CHECK (org_id = ANY (app_current_org_ids()));

ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations FORCE ROW LEVEL SECURITY;
CREATE POLICY citations_isolation ON citations
  FOR ALL USING (
    chunk_id IN (SELECT id FROM chunks WHERE org_id = ANY (app_current_org_ids()))
  )
  WITH CHECK (
    chunk_id IN (SELECT id FROM chunks WHERE org_id = ANY (app_current_org_ids()))
  );

-- ---------------------------------------------------------------------------
-- Least-privilege runtime role. Not a superuser, not the table owner — so
-- RLS actually applies to it. Local dev credential, same posture as the
-- `brain`/`brain` pair STACK.md already publishes in plain text.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user' NOSUPERUSER;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT ON orgs TO app_user;  -- tenant directory, not tenant content — see note above orgs
GRANT SELECT, INSERT, UPDATE, DELETE ON
  executives, documents, chunks, generated_documents, citations
  TO app_user;
GRANT EXECUTE ON FUNCTION app_current_org_ids() TO app_user;

-- ---------------------------------------------------------------------------
-- Seed the tenant directory — DAW Capital + its three portcos.
-- ---------------------------------------------------------------------------
INSERT INTO orgs (slug, name, kind) VALUES
  ('daw-fund', 'DAW Capital', 'fund');

INSERT INTO orgs (slug, name, kind, fund_id) VALUES
  ('pc1-vantage',   'Vantage Managed Services',   'portco', (SELECT id FROM orgs WHERE slug = 'daw-fund')),
  ('pc2-cascade',   'Cascade Care Group',         'portco', (SELECT id FROM orgs WHERE slug = 'daw-fund')),
  ('pc3-ridgeline', 'Ridgeline Freight & Logistics', 'portco', (SELECT id FROM orgs WHERE slug = 'daw-fund'));
