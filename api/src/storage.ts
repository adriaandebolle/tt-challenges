import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.js";

const s3 = new S3Client({
  endpoint: env.minioEndpoint,
  forcePathStyle: true,
  region: "us-east-1",
  credentials: { accessKeyId: env.minioAccessKey, secretAccessKey: env.minioSecretKey },
});

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({ Bucket: env.documentsBucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectText(key: string): Promise<string> {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: env.documentsBucket, Key: key }));
  const bytes = await Body!.transformToByteArray();
  return Buffer.from(bytes).toString("utf8");
}
