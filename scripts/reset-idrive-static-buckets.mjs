import { createHash, createHmac } from "node:crypto";

const config = {
  endpoint: process.env.IDRIVE_E2_ENDPOINT || "https://s3.us-west-2.idrivee2.com",
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: process.env.IDRIVE_E2_ACCESS_KEY || "",
  secretKey: process.env.IDRIVE_E2_SECRET_KEY || "",
  buckets: (process.env.IDRIVE_E2_RESET_BUCKETS || "smyst.com,app.smyst.com,cdn.smyst.com")
    .split(",")
    .map((bucket) => bucket.trim())
    .filter(Boolean),
};

const endpointUrl = new URL(config.endpoint);
const allowedBuckets = new Set(["smyst.com", "app.smyst.com", "cdn.smyst.com"]);
const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(query = {}) {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value ?? "")}`)
    .join("&");
}

function objectPath(bucket, objectKey = "") {
  const parts = [bucket];
  if (objectKey) {
    parts.push(...objectKey.split("/").filter(Boolean));
  }
  return `/${parts.map(encodePathSegment).join("/")}`;
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

async function s3Request(method, bucket, objectKey = "", options = {}) {
  if (!config.accessKey || !config.secretKey) {
    throw new Error("Missing IDRIVE_E2_ACCESS_KEY or IDRIVE_E2_SECRET_KEY.");
  }

  const body = options.body || "";
  const bodyHash = sha256Hex(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const query = canonicalQuery(options.query);
  const requestPath = objectPath(bucket, objectKey);
  const url = new URL(requestPath, endpointUrl);
  url.search = query;

  const headers = {
    host: endpointUrl.host,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amzDate,
    ...(options.headers || {}),
  };

  const canonicalHeaders = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
  const signedHeaders = Object.keys(headers)
    .map((key) => key.toLowerCase())
    .sort()
    .join(";");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const canonicalRequest = [
    method,
    requestPath,
    query,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretKey}`, dateStamp), config.region), "s3"),
    "aws4_request",
  );
  const signature = hmac(signingKey, stringToSign, "hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const init = { method, headers };
      if (method !== "GET" && method !== "HEAD") {
        init.body = body;
      }
      const response = await fetch(url, init);
      const text = await response.text();
      if (response.ok || (method === "DELETE" && response.status === 404)) {
        return text;
      }
      if (!transientStatuses.has(response.status) || attempt === 4) {
        throw new Error(`${method} ${bucket}/${objectKey} failed: ${response.status} ${text}`);
      }
      lastError = new Error(`${method} ${bucket}/${objectKey} transient ${response.status}`);
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      lastError = error;
    }
    const delay = 500 * 2 ** (attempt - 1);
    console.warn(`${method} ${bucket}/${objectKey} retry ${attempt}/3 after ${lastError.message}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw lastError;
}

async function listObjectKeys(bucket) {
  const keys = [];
  let continuationToken = "";
  do {
    const query = { "list-type": "2", "max-keys": "1000" };
    if (continuationToken) {
      query["continuation-token"] = continuationToken;
    }
    const xml = await s3Request("GET", bucket, "", { query });
    keys.push(...[...xml.matchAll(/<Key>(.*?)<\/Key>/gs)].map((match) => decodeXml(match[1])));
    continuationToken =
      xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/s)?.[1] || "";
    continuationToken = continuationToken ? decodeXml(continuationToken) : "";
  } while (continuationToken);
  return keys;
}

async function resetBucket(bucket) {
  if (!allowedBuckets.has(bucket)) {
    throw new Error(`Refusing to reset non-static bucket: ${bucket}`);
  }

  const keys = await listObjectKeys(bucket);
  console.log(`${bucket}: deleting ${keys.length} objects`);
  for (const key of keys) {
    await s3Request("DELETE", bucket, key);
  }
  await s3Request("DELETE", bucket);
  console.log(`${bucket}: deleted bucket`);
}

async function main() {
  if (!config.buckets.length) {
    throw new Error("No buckets configured for reset.");
  }
  for (const bucket of config.buckets) {
    await resetBucket(bucket);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
