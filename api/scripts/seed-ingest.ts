import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { pool, withOrgContext, resolveAllOrgIds, getOrgBySlug } from "../src/db.js";
import { putObject } from "../src/storage.js";
import { enqueueIngestJob } from "../src/queue.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../../data");

// Provenance by path, not guesswork: everything under data/fund belongs to
// the fund org, everything under data/portcos/PC<n> to that portco. See
// DECISIONS.md's data-model checkpoint.
const ORG_FOR_PREFIX: { prefix: string; slug: string }[] = [
  { prefix: "fund", slug: "daw-fund" },
  { prefix: path.join("portcos", "PC1"), slug: "pc1-vantage" },
  { prefix: path.join("portcos", "PC2"), slug: "pc2-cascade" },
  { prefix: path.join("portcos", "PC3"), slug: "pc3-ridgeline" },
];

function orgSlugForRelPath(relPath: string): string {
  const hit = ORG_FOR_PREFIX.find((o) => relPath === o.prefix || relPath.startsWith(o.prefix + path.sep));
  if (!hit) throw new Error(`Don't know which org owns: ${relPath}`);
  return hit.slug;
}

function walk(dir: string): string[] {
  let files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function contentTypeFor(ext: string): string {
  switch (ext) {
    case "md":
      return "text/markdown";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

async function main() {
  const allFiles = walk(dataDir);
  const allOrgIds = await resolveAllOrgIds();

  let queued = 0;
  await withOrgContext(allOrgIds, async (client) => {
    for (const absPath of allFiles) {
      const relPath = path.relative(dataDir, absPath);
      const orgSlug = orgSlugForRelPath(relPath);
      const org = await getOrgBySlug(orgSlug);
      if (!org) throw new Error(`Org not seeded: ${orgSlug}`);

      const ext = path.extname(absPath).slice(1).toLowerCase();
      const raw = fs.readFileSync(absPath);

      // Doc type only matters (and is only readable) for markdown — office
      // files fail before anything tries to parse them. See DECISIONS.md's
      // ingest-scope checkpoint.
      let docType: string | null = null;
      if (ext === "md") {
        try {
          docType = (matter(raw.toString("utf8")).data?.doc_type as string) ?? null;
        } catch {
          docType = null;
        }
      }

      const storageKey = `${orgSlug}/${relPath.split(path.sep).join("/")}`;
      await putObject(storageKey, raw, contentTypeFor(ext));

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO documents (org_id, origin, source_path, doc_type, file_extension, storage_key, status)
         VALUES ($1, 'ingested', $2, $3, $4, $5, 'queued')
         ON CONFLICT (org_id, source_path) DO UPDATE
           SET status = 'queued', status_reason = NULL, updated_at = now()
         RETURNING id`,
        [org.id, relPath, docType, ext, storageKey],
      );
      const documentId = rows[0].id;
      await enqueueIngestJob({ documentId });
      queued++;
      console.log(`queued  ${relPath}  → ${orgSlug}`);
    }
  });

  console.log(`\n${queued} documents queued through the real pipeline (MinIO + ElasticMQ).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
