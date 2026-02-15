const fs = require("node:fs/promises");
const path = require("node:path");
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function normalizeKey(key) {
  return String(key || "").replace(/^\/+/, "");
}

function requiredEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

function loadR2Config() {
  const endpoint =
    requiredEnv("R2_ENDPOINT") ||
    (requiredEnv("R2_ACCOUNT_ID")
      ? `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`
      : "");
  const bucket = requiredEnv("R2_BUCKET") || requiredEnv("R2_BUCKET_DEV");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  const publicBaseUrl = requiredEnv("R2_PUBLIC_BASE_URL");

  const enabled = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
  return {
    enabled,
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

function createR2Client(config) {
  if (!config.enabled) return null;
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function ensureR2(r2) {
  if (!r2 || !r2.enabled || !r2.client) {
    const err = new Error("r2 is not configured");
    err.status = 503;
    throw err;
  }
}

function objectUrl(r2, key) {
  const normalized = normalizeKey(key);
  if (r2.config.publicBaseUrl) {
    return `${r2.config.publicBaseUrl.replace(/\/+$/, "")}/${normalized}`;
  }
  return `${r2.config.endpoint.replace(/\/+$/, "")}/${r2.config.bucket}/${normalized}`;
}

async function putBuffer(r2, key, body, contentType = "application/octet-stream", metadata = {}) {
  ensureR2(r2);
  const normalized = normalizeKey(key);
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.config.bucket,
      Key: normalized,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    })
  );
  return {
    key: normalized,
    bucket: r2.config.bucket,
    url: objectUrl(r2, normalized),
  };
}

async function putJson(r2, key, value) {
  const payload = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  return putBuffer(r2, key, payload, "application/json");
}

async function uploadLocalFile(r2, localFilePath, key, contentType = "application/octet-stream") {
  const abs = path.resolve(localFilePath);
  const body = await fs.readFile(abs);
  return putBuffer(r2, key, body, contentType, {
    source: "local_file",
  });
}

async function listObjects(r2, prefix = "", maxKeys = 100) {
  ensureR2(r2);
  const response = await r2.client.send(
    new ListObjectsV2Command({
      Bucket: r2.config.bucket,
      Prefix: normalizeKey(prefix),
      MaxKeys: Math.max(1, Math.min(Number(maxKeys) || 100, 1000)),
    })
  );
  return (response.Contents || []).map((item) => ({
    key: item.Key,
    size: item.Size,
    last_modified: item.LastModified,
    etag: item.ETag,
  }));
}

async function getObjectText(r2, key) {
  ensureR2(r2);
  const response = await r2.client.send(
    new GetObjectCommand({
      Bucket: r2.config.bucket,
      Key: normalizeKey(key),
    })
  );
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function headObject(r2, key) {
  ensureR2(r2);
  const response = await r2.client.send(
    new HeadObjectCommand({
      Bucket: r2.config.bucket,
      Key: normalizeKey(key),
    })
  );
  return {
    content_type: response.ContentType,
    content_length: response.ContentLength,
    etag: response.ETag,
    last_modified: response.LastModified,
  };
}

async function signedGetUrl(r2, key, expiresIn = 3600) {
  ensureR2(r2);
  const command = new GetObjectCommand({
    Bucket: r2.config.bucket,
    Key: normalizeKey(key),
  });
  const url = await getSignedUrl(r2.client, command, {
    expiresIn: Math.max(60, Math.min(Number(expiresIn) || 3600, 60 * 60 * 24)),
  });
  return { url, expires_in: expiresIn };
}

async function syncSeedData(r2, rootDir) {
  ensureR2(r2);
  const files = [
    {
      local: path.join(rootDir, "data", "tag_taxonomy.v1.json"),
      key: "data/v1/tag_taxonomy.v1.json",
      contentType: "application/json",
    },
    {
      local: path.join(rootDir, "data", "countries.v1.json"),
      key: "data/v1/countries.v1.json",
      contentType: "application/json",
    },
  ];

  const result = [];
  for (const file of files) {
    const uploaded = await uploadLocalFile(r2, file.local, file.key, file.contentType);
    result.push(uploaded);
  }
  return result;
}

function buildR2State() {
  const config = loadR2Config();
  const client = createR2Client(config);
  return {
    enabled: config.enabled,
    config,
    client,
  };
}

module.exports = {
  buildR2State,
  putBuffer,
  putJson,
  uploadLocalFile,
  listObjects,
  getObjectText,
  headObject,
  signedGetUrl,
  syncSeedData,
  objectUrl,
};
