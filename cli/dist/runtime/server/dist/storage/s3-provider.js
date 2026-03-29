import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { notFound, unprocessable } from "../errors.js";
function normalizePrefix(prefix) {
    if (!prefix)
        return "";
    return prefix
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}
function buildKey(prefix, objectKey) {
    if (!prefix)
        return objectKey;
    return `${prefix}/${objectKey}`;
}
async function toReadableStream(body) {
    if (!body)
        throw notFound("Object not found");
    if (body instanceof Readable)
        return body;
    const candidate = body;
    if (typeof candidate.transformToWebStream === "function") {
        const webStream = candidate.transformToWebStream();
        const reader = webStream.getReader();
        return Readable.from((async function* () {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (value)
                    yield value;
            }
        })());
    }
    if (typeof candidate.arrayBuffer === "function") {
        const buffer = Buffer.from(await candidate.arrayBuffer());
        return Readable.from(buffer);
    }
    throw unprocessable("Unsupported S3 body stream type");
}
function toDate(value) {
    return value instanceof Date ? value : undefined;
}
export function createS3StorageProvider(config) {
    const bucket = config.bucket.trim();
    const region = config.region.trim();
    if (!bucket)
        throw unprocessable("S3 storage bucket is required");
    if (!region)
        throw unprocessable("S3 storage region is required");
    const prefix = normalizePrefix(config.prefix);
    const client = new S3Client({
        region,
        endpoint: config.endpoint,
        forcePathStyle: Boolean(config.forcePathStyle),
    });
    return {
        id: "s3",
        async putObject(input) {
            const key = buildKey(prefix, input.objectKey);
            await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: input.body,
                ContentType: input.contentType,
                ContentLength: input.contentLength,
            }));
        },
        async getObject(input) {
            const key = buildKey(prefix, input.objectKey);
            try {
                const output = await client.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: key,
                }));
                return {
                    stream: await toReadableStream(output.Body),
                    contentType: output.ContentType,
                    contentLength: output.ContentLength,
                    etag: output.ETag,
                    lastModified: toDate(output.LastModified),
                };
            }
            catch (err) {
                const code = err.name;
                if (code === "NoSuchKey" || code === "NotFound")
                    throw notFound("Object not found");
                throw err;
            }
        },
        async headObject(input) {
            const key = buildKey(prefix, input.objectKey);
            try {
                const output = await client.send(new HeadObjectCommand({
                    Bucket: bucket,
                    Key: key,
                }));
                return {
                    exists: true,
                    contentType: output.ContentType,
                    contentLength: output.ContentLength,
                    etag: output.ETag,
                    lastModified: toDate(output.LastModified),
                };
            }
            catch (err) {
                const code = err.name;
                if (code === "NoSuchKey" || code === "NotFound")
                    return { exists: false };
                throw err;
            }
        },
        async deleteObject(input) {
            const key = buildKey(prefix, input.objectKey);
            await client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            }));
        },
    };
}
//# sourceMappingURL=s3-provider.js.map