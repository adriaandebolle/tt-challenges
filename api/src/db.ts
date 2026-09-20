import pg from "pg";
import { env } from "./env.js";

// Deliberately appDatabaseUrl, not databaseUrl: this pool serves every
// request-time query, and only the non-superuser app_user role is actually
// bound by the RLS policies in 0001_init.sql. See that file's header note.
export const pool = new pg.Pool({ connectionString: env.appDatabaseUrl });

export type OrgScope = "fund" | "pc1" | "pc2" | "pc3";

const SCOPE_SLUG: Record<OrgScope, string> = {
  fund: "daw-fund",
  pc1: "pc1-vantage",
  pc2: "pc2-cascade",
  pc3: "pc3-ridgeline",
};

/**
 * Resolves an org-scope selector (stand-in for real auth, out of scope for
 * this build — see DECISIONS.md) into the set of org ids a request may see:
 * the fund sees itself plus every portco under it; a portco sees only itself.
 * Reads `orgs` directly — it isn't RLS'd, it's the tenant directory, not
 * tenant content.
 */
export async function resolveOrgIds(scope: OrgScope): Promise<string[]> {
  const slug = SCOPE_SLUG[scope];
  const { rows } = await pool.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM orgs WHERE slug = $1`,
    [slug],
  );
  if (rows.length === 0) throw new Error(`Unknown org scope: ${scope}`);
  const org = rows[0];
  if (org.kind === "portco") return [org.id];

  const { rows: portcos } = await pool.query<{ id: string }>(
    `SELECT id FROM orgs WHERE fund_id = $1`,
    [org.id],
  );
  return [org.id, ...portcos.map((p) => p.id)];
}

/**
 * Runs `fn` inside a transaction with app.current_org_ids set for the
 * duration — the only way RLS'd tables (documents/chunks/generated_documents/
 * citations/executives) yield any rows. Fails closed: no context, no rows.
 */
export async function withOrgContext<T>(
  orgIds: string[],
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_ids', $1, true)", [orgIds.join(",")]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Every org id that exists. For the worker/seed script only — those are
 * trusted system processes that legitimately touch every tenant's rows
 * (whichever org a given document actually belongs to), not a stand-in for a
 * request from a specific fund or portco user. Deliberately still goes
 * through the same app.current_org_ids mechanism as every other query rather
 * than a role-specific bypass policy — one isolation mechanism, not two. */
export async function resolveAllOrgIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM orgs`);
  return rows.map((r) => r.id);
}

export async function getOrgBySlug(slug: string): Promise<{ id: string; kind: string } | null> {
  const { rows } = await pool.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM orgs WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function upsertExecutive(
  client: pg.PoolClient,
  orgId: string,
  name: string,
  role: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO executives (org_id, name, role) VALUES ($1, $2, $3)
     ON CONFLICT (org_id, name) DO UPDATE SET role = EXCLUDED.role
     RETURNING id`,
    [orgId, name, role],
  );
  return rows[0].id;
}
