import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import { env } from "./env.js";

const sqs = new SQSClient({
  endpoint: env.queueEndpoint,
  region: "elasticmq",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

let queueUrlPromise: Promise<string> | null = null;
function getQueueUrl(): Promise<string> {
  if (!queueUrlPromise) {
    queueUrlPromise = sqs
      .send(new GetQueueUrlCommand({ QueueName: env.ingestQueueName }))
      .then((r) => r.QueueUrl!);
  }
  return queueUrlPromise;
}

export interface IngestJob {
  documentId: string;
}

export async function enqueueIngestJob(job: IngestJob) {
  const QueueUrl = await getQueueUrl();
  await sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(job) }));
}

export interface ReceivedJob {
  job: IngestJob;
  receiptHandle: string;
}

export async function receiveIngestJobs(maxMessages = 5, waitSeconds = 10): Promise<ReceivedJob[]> {
  const QueueUrl = await getQueueUrl();
  const { Messages } = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitSeconds,
    }),
  );
  if (!Messages) return [];
  return Messages.map((m) => ({
    job: JSON.parse(m.Body!) as IngestJob,
    receiptHandle: m.ReceiptHandle!,
  }));
}

export async function deleteIngestJob(receiptHandle: string) {
  const QueueUrl = await getQueueUrl();
  await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: receiptHandle }));
}
