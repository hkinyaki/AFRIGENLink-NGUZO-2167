import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET!;

import { MAX_UPLOAD_BYTES } from "./security";

/**
 * Presigned PUT — client uploads the file directly to storage.
 * Locks the ContentType (server-decided) and a max content length so the
 * browser can't smuggle a different MIME or an oversized object.
 */
export function presignPut(key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: undefined,
    }),
    { expiresIn: 600, signableHeaders: new Set(["content-type"]) }
  );
}

export { MAX_UPLOAD_BYTES };

/**
 * Server-side direct upload of an in-memory buffer (e.g. a generated PDF).
 * Returns the stored object key so a `documents` row can reference it and
 * `presignGet` can later yield a short-lived View URL.
 */
export async function uploadBuffer(key: string, body: Uint8Array | Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Presigned GET — short-lived read URL for an uploaded object.
 * Forces an attachment disposition so a malicious uploaded HTML/SVG can't be
 * rendered inline in the user's session origin.
 */
export function presignGet(key: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: "attachment",
    }),
    { expiresIn: 3600 }
  );
}
