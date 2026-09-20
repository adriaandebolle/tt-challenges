import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { SQSClient, CreateQueueCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { env } from "../src/env.js";

const s3 = new S3Client({
  endpoint: env.minioEndpoint,
  forcePathStyle: true,
  region: "us-east-1",
  credentials: { accessKeyId: env.minioAccessKey, secretAccessKey: env.minioSecretKey },
});

const sqs = new SQSClient({
  endpoint: env.queueEndpoint,
  region: "elasticmq",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function ensureBucket(name: string) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    console.log(`bucket "${name}" already exists`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`created bucket "${name}"`);
  }
}

async function ensureQueue(name: string) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
    console.log(`queue "${name}" already exists (${QueueUrl})`);
  } catch {
    const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: name }));
    console.log(`created queue "${name}" (${QueueUrl})`);
  }
}

async function main() {
  await ensureBucket(env.documentsBucket);
  await ensureQueue(env.ingestQueueName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
