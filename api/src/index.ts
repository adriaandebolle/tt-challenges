import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { answerQuestion } from "./chat.js";
import { generateExecBrief } from "./generate.js";
import { getDashboard } from "./dashboard.js";
import { pool, resolveOrgIds, withOrgContext, type OrgScope } from "./db.js";
import { getObjectText } from "./storage.js";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

// Not RLS'd — the tenant directory, not tenant content. Powers the org
// switcher that stands in for real auth (see DECISIONS.md).
app.get("/api/orgs", async (c) => {
  const { rows } = await pool.query(
    `SELECT slug, name, kind FROM orgs ORDER BY kind DESC, slug`,
  );
  return c.json(rows);
});

app.get("/api/documents", async (c) => {
  const scope = c.req.query("orgScope") as OrgScope | undefined;
  if (!scope) return c.json({ error: "orgScope is required" }, 400);

  try {
    const orgIds = await resolveOrgIds(scope);
    const rows = await withOrgContext(orgIds, async (client) => {
      const { rows } = await client.query(
        `SELECT d.id, d.source_path, d.doc_type, d.file_extension, d.status,
                d.status_reason, d.origin, d.created_at, d.updated_at, o.slug AS org_slug
         FROM documents d
         JOIN orgs o ON o.id = d.org_id
         ORDER BY d.updated_at DESC`,
      );
      return rows;
    });
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Makes a citation an actual openable source, not inert text — SPEC.md's
// "a reader can open the source and find the line." Ingested docs are read
// from MinIO (the real stored file); generated docs are already in Postgres.
app.get("/api/documents/:id/content", async (c) => {
  const scope = c.req.query("orgScope") as OrgScope | undefined;
  const id = c.req.param("id");
  if (!scope) return c.json({ error: "orgScope is required" }, 400);

  try {
    const orgIds = await resolveOrgIds(scope);
    const doc = await withOrgContext(orgIds, async (client) => {
      const { rows } = await client.query(
        `SELECT d.source_path, d.doc_type, d.storage_key, d.origin, gd.title AS generated_title, gd.content AS generated_content
         FROM documents d
         LEFT JOIN generated_documents gd ON gd.id = d.generated_document_id
         WHERE d.id = $1`,
        [id],
      );
      return rows[0];
    });
    if (!doc) return c.json({ error: "Document not found (or not visible in this scope)" }, 404);

    const content =
      doc.origin === "generated" ? doc.generated_content : await getObjectText(doc.storage_key);

    return c.json({
      sourcePath: doc.origin === "generated" ? doc.generated_title : doc.source_path,
      docType: doc.doc_type,
      content,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.get("/api/executives", async (c) => {
  const scope = c.req.query("orgScope") as OrgScope | undefined;
  if (!scope) return c.json({ error: "orgScope is required" }, 400);

  try {
    const orgIds = await resolveOrgIds(scope);
    const rows = await withOrgContext(orgIds, async (client) => {
      const { rows } = await client.query(
        `SELECT e.id, e.name, e.role, o.slug AS org_slug, o.name AS org_name
         FROM executives e
         JOIN orgs o ON o.id = e.org_id
         ORDER BY o.slug, e.name`,
      );
      return rows;
    });
    return c.json(rows);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/generate/exec-brief", async (c) => {
  const body = await c.req.json<{ orgScope?: OrgScope; executiveId?: string }>().catch(() => null);
  if (!body?.orgScope || !body?.executiveId) {
    return c.json({ error: "orgScope and executiveId are required" }, 400);
  }

  try {
    const orgIds = await resolveOrgIds(body.orgScope);
    const result = await generateExecBrief(body.executiveId, orgIds);
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.get("/api/dashboard", async (c) => {
  const scope = c.req.query("orgScope") as OrgScope | undefined;
  if (!scope) return c.json({ error: "orgScope is required" }, 400);

  try {
    const orgIds = await resolveOrgIds(scope);
    const data = await getDashboard(orgIds);
    return c.json(data);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/chat", async (c) => {
  const body = await c.req.json<{ orgScope?: OrgScope; message?: string }>().catch(() => null);
  if (!body?.message?.trim() || !body?.orgScope) {
    return c.json({ error: "orgScope and message are required" }, 400);
  }

  try {
    const orgIds = await resolveOrgIds(body.orgScope);
    const result = await answerQuestion(orgIds, body.message.trim());
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`API listening on http://localhost:${port}`);
