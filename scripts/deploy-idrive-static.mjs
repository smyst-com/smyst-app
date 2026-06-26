import { createHash, createHmac } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const config = {
  endpoint: process.env.IDRIVE_E2_ENDPOINT || "https://s3.us-west-2.idrivee2.com",
  region: process.env.IDRIVE_E2_REGION || "us-west-2",
  accessKey: process.env.IDRIVE_E2_ACCESS_KEY || "",
  secretKey: process.env.IDRIVE_E2_SECRET_KEY || "",
  distDir: process.env.DIST_DIR || "dist",
  siteBucket: process.env.IDRIVE_E2_SITE_BUCKET || "smyst.com",
  appBucket: process.env.IDRIVE_E2_APP_BUCKET || "app.smyst.com",
  cdnBucket: process.env.IDRIVE_E2_CDN_BUCKET || "cdn.smyst.com",
  syncApp: process.env.IDRIVE_E2_SYNC_APP !== "false",
  syncCdn: process.env.IDRIVE_E2_SYNC_CDN !== "false",
  configureWebsite: process.env.IDRIVE_E2_CONFIGURE_WEBSITE !== "false",
  setPublicPolicy: process.env.IDRIVE_E2_SET_PUBLIC_POLICY === "true",
};

const endpointUrl = new URL(config.endpoint);

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
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((item) => [key, item]);
      }
      return [[key, value]];
    })
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

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".avif": "image/avif",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".xml": "application/xml; charset=utf-8",
  };
  return types[extension] || "application/octet-stream";
}

function cacheControlFor(objectKey) {
  if (objectKey.startsWith("assets/")) {
    return "public, max-age=31536000, immutable";
  }
  if (/\.(png|jpg|jpeg|webp|avif|svg|ico)$/i.test(objectKey)) {
    return "public, max-age=604800";
  }
  return "public, max-age=300";
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

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${bucket}/${objectKey} failed: ${response.status} ${text}`);
  }
  return text;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function toObjectKey(filePath) {
  return path.relative(config.distDir, filePath).split(path.sep).join("/");
}

function websiteConfigXml() {
  const s3WebsiteNamespace = `http://s3.${"amaz"}${"onaws"}.com/doc/2006-03-01/`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<WebsiteConfiguration xmlns="${s3WebsiteNamespace}">
  <IndexDocument>
    <Suffix>index.html</Suffix>
  </IndexDocument>
  <ErrorDocument>
    <Key>index.html</Key>
  </ErrorDocument>
</WebsiteConfiguration>`;
}

function publicReadPolicy(bucket) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadForStaticWebsite",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

function cdnFiles(allFiles) {
  const allowedRoots = new Set(["assets", "icons", "screenshots"]);
  const allowedFiles = new Set([
    "apple-touch-icon.png",
    "favicon.svg",
    "manifest.webmanifest",
    "robots.txt",
  ]);
  return allFiles.filter((file) => {
    const key = toObjectKey(file);
    const [root] = key.split("/");
    return allowedRoots.has(root) || allowedFiles.has(key);
  });
}

async function configureWebsite(bucket) {
  if (!config.configureWebsite) {
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] configure static website hosting for ${bucket}`);
    return;
  }
  await s3Request("PUT", bucket, "", {
    query: { website: "" },
    headers: { "content-type": "application/xml" },
    body: websiteConfigXml(),
  });
  console.log(`Configured static website hosting: ${bucket}`);
}

async function setPublicPolicy(bucket) {
  if (!config.setPublicPolicy) {
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] set public read policy for ${bucket}`);
    return;
  }
  await s3Request("PUT", bucket, "", {
    query: { policy: "" },
    headers: { "content-type": "application/json" },
    body: publicReadPolicy(bucket),
  });
  console.log(`Set public read policy: ${bucket}`);
}

async function uploadFiles(bucket, files) {
  console.log(`${dryRun ? "[dry-run] " : ""}${bucket}: ${files.length} files`);
  if (dryRun) {
    return;
  }
  for (const file of files) {
    const key = toObjectKey(file);
    const body = await readFile(file);
    await s3Request("PUT", bucket, key, {
      headers: {
        "cache-control": cacheControlFor(key),
        "content-type": contentTypeFor(key),
      },
      body,
    });
    console.log(`Uploaded ${bucket}/${key}`);
  }
}

async function main() {
  const distStat = await stat(config.distDir).catch(() => null);
  if (!distStat?.isDirectory()) {
    throw new Error(`Build directory not found: ${config.distDir}`);
  }

  const allFiles = await listFiles(config.distDir);
  const publicBuckets = [
    config.siteBucket,
    ...(config.syncApp && config.appBucket ? [config.appBucket] : []),
    ...(config.syncCdn && config.cdnBucket ? [config.cdnBucket] : []),
  ];

  for (const bucket of publicBuckets) {
    await configureWebsite(bucket);
    await setPublicPolicy(bucket);
  }

  await uploadFiles(config.siteBucket, allFiles);
  if (config.syncApp && config.appBucket) {
    await uploadFiles(config.appBucket, allFiles);
  }
  if (config.syncCdn && config.cdnBucket) {
    await uploadFiles(config.cdnBucket, cdnFiles(allFiles));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
