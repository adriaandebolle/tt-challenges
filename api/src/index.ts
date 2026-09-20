import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { answerQuestion } from "./chat.js";
import { pool, resolveOrgIds, withOrgContext, type OrgScope } from "./db.js";

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
