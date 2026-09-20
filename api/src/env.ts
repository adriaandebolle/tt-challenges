import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Single source of truth: the repo-root .env (STACK.md keeps the only
// secret, ANTHROPIC_API_KEY, there). Loaded once, from wherever a script runs.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  // Superuser — migrations only (DDL). Never used for a request-serving query.
  databaseUrl: process.env.DATABASE_URL ?? "postgres://brain:brain@localhost:5432/secondbrain",
  // Least-privilege — every runtime query the API makes. RLS only constrains this role.
  appDatabaseUrl:
    process.env.APP_DATABASE_URL ?? "postgres://app_user:app_user@localhost:5432/secondbrain",
  minioEndpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? "minio-root",
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? "minio-secret",
  documentsBucket: process.env.DOCUMENTS_BUCKET ?? "documents",
  queueEndpoint: process.env.QUEUE_ENDPOINT ?? "http://localhost:9324",
  ingestQueueName: process.env.INGEST_QUEUE_NAME ?? "ingest-queue",
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
};
