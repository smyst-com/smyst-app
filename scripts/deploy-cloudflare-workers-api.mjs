import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const accountId = '477794df69f0b6a0b9e4c59e36883c1f';
const zoneName = 'smyst.com';
const tokenFile = process.env.SMYST_CF_TOKEN_FILE || '/private/tmp/smyst_cf_token';
const secretsFile = process.env.SMYST_WORKER_SECRETS_FILE || '/private/tmp/smyst_worker_secrets.json';
const token = (await readFile(tokenFile, 'utf8')).trim();
const secrets = JSON.parse(await readFile(secretsFile, 'utf8').catch(() => '{}'));

const commonVars = {
  CANONICAL_HOST: 'https://smyst.com',
  ORIGIN_URL: 'https://smyst-vite-app.pages.dev',
};

const kv = {
  TRANSLATIONS: 'd759942d22f64ae5ab9af0801bba78d9',
  SESSIONS: 'd74ab18d7859464b92fc730bd453fcc6',
  OAUTH_STATE: 'bafc5fc93a504c9abf33af69601e31dc',
  METADATA: '24a718c1c31248779add893b93fd4152',
};

const deployments = [
  {
    name: 'smyst-auth',
    entry: 'workers/auth-github.ts',
    routes: ['smyst.com/auth/*'],
    vars: {
      ...commonVars,
      SMYST_OWNER_GITHUB_IDS: '',
      SMYST_OWNER_EMAILS: '',
      SMYST_ADMIN_GITHUB_IDS: '',
      SMYST_ADMIN_EMAILS: '',
    },
    kv: ['TRANSLATIONS', 'SESSIONS', 'OAUTH_STATE'],
    secrets: ['GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'AUTH_HMAC_SECRET'],
  },
  {
    name: 'smyst-api',
    entry: 'workers/api.ts',
    routes: ['smyst.com/api/*'],
    vars: commonVars,
    kv: ['SESSIONS', 'OAUTH_STATE', 'METADATA'],
    secrets: ['AUTH_HMAC_SECRET'],
  },
  {
    name: 'smyst-storage',
    entry: 'workers/storage-idrive.ts',
    routes: ['smyst.com/storage/*'],
    vars: {
      ...commonVars,
      IDRIVE_E2_ENDPOINT: 'https://s3.us-west-2.idrivee2.com',
      IDRIVE_E2_BUCKET: 'smyst-memories',
      IDRIVE_E2_REGION: 'us-west-2',
      IDRIVE_E2_MAX_FILE_BYTES: '52428800',
      IDRIVE_E2_USER_MONTHLY_BYTES: '52428800',
      IDRIVE_E2_GLOBAL_BYTES: '1073741824',
      IDRIVE_E2_USER_STORAGE_BYTES: '104857600',
      IDRIVE_E2_GLOBAL_STORAGE_BYTES: '1073741824',
      IDRIVE_E2_MAX_IMAGE_BYTES: '10485760',
      IDRIVE_E2_MAX_VIDEO_BYTES: '52428800',
      IDRIVE_E2_MAX_AUDIO_BYTES: '26214400',
      IDRIVE_E2_MAX_DOCUMENT_BYTES: '20971520',
      IDRIVE_E2_MAX_PROFILE_IMAGE_BYTES: '2097152',
      IDRIVE_E2_MAX_BACKUP_BYTES: '26214400',
      IDRIVE_E2_MAX_TWIN_DATA_BYTES: '10485760',
    },
    kv: ['TRANSLATIONS', 'SESSIONS', 'METADATA', 'OAUTH_STATE'],
    secrets: [
      'GITHUB_OAUTH_CLIENT_ID',
      'GITHUB_OAUTH_CLIENT_SECRET',
      'AUTH_HMAC_SECRET',
      'IDRIVE_E2_ACCESS_KEY',
      'IDRIVE_E2_SECRET_KEY',
    ],
  },
  {
    name: 'smyst-translate',
    entry: 'workers/translate.ts',
    routes: ['smyst.com/*'],
    vars: commonVars,
    kv: ['TRANSLATIONS'],
    secrets: ['ADMIN_TOKEN'],
  },
];

const deploymentFilter = (process.env.SMYST_WORKER_DEPLOY_FILTER || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

secrets.AUTH_HMAC_SECRET ||= randomBytes(48).toString('base64url');
secrets.ADMIN_TOKEN ||= randomBytes(32).toString('base64url');
await writeFile(secretsFile, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cf(path, init = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { success: false, raw: text };
    }
    if (response.ok && payload.success !== false) {
      return payload.result;
    }
    const errors = payload.errors || payload;
    lastError = new Error(`${init.method || 'GET'} ${path} failed ${response.status}: ${JSON.stringify(errors)}`);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      break;
    }
    const delay = attempt * 1500;
    console.warn(`Cloudflare API ${response.status} for ${path}; retrying in ${delay}ms...`);
    await sleep(delay);
  }
  throw lastError;
}

async function bundleWorker(dep) {
  const outfile = `/private/tmp/${dep.name}.mjs`;
  await build({
    entryPoints: [dep.entry],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    outfile,
    logLevel: 'silent',
  });
  return readFile(outfile, 'utf8');
}

function bindingsFor(dep) {
  const bindings = [];
  for (const [name, text] of Object.entries(dep.vars)) {
    bindings.push({ type: 'plain_text', name, text });
  }
  for (const name of dep.kv) {
    bindings.push({ type: 'kv_namespace', name, namespace_id: kv[name] });
  }
  return bindings;
}

async function uploadWorker(dep) {
  const code = await bundleWorker(dep);
  const metadata = {
    main_module: 'worker.mjs',
    compatibility_date: '2025-04-01',
    compatibility_flags: ['nodejs_compat'],
    bindings: bindingsFor(dep),
  };
  const form = new FormData();
  form.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json' }));
  form.append('worker.mjs', new File([code], 'worker.mjs', { type: 'application/javascript+module' }));
  await cf(`/accounts/${accountId}/workers/scripts/${dep.name}`, { method: 'PUT', body: form });
}

async function setSecret(scriptName, name, text) {
  if (!text) return { name, skipped: true };
  await cf(`/accounts/${accountId}/workers/scripts/${scriptName}/secrets`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, text, type: 'secret_text' }),
  });
  return { name, skipped: false };
}

async function upsertRoutes(zoneId, dep) {
  const existing = await cf(`/zones/${zoneId}/workers/routes`);
  const output = [];
  for (const pattern of dep.routes) {
    const current = existing.find((route) => route.pattern === pattern);
    if (current) {
      await cf(`/zones/${zoneId}/workers/routes/${current.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pattern, script: dep.name }),
      });
      output.push({ pattern, action: 'updated' });
    } else {
      await cf(`/zones/${zoneId}/workers/routes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pattern, script: dep.name }),
      });
      output.push({ pattern, action: 'created' });
    }
  }
  return output;
}

const zones = await cf(`/zones?name=${encodeURIComponent(zoneName)}`);
const zoneId = zones[0]?.id;
if (!zoneId) throw new Error(`Zone not found: ${zoneName}`);

const activeDeployments = deploymentFilter.length
  ? deployments.filter((dep) => deploymentFilter.includes(dep.name))
  : deployments;
if (!activeDeployments.length) {
  throw new Error(`No workers match SMYST_WORKER_DEPLOY_FILTER=${deploymentFilter.join(',')}`);
}

const summary = [];
for (const dep of activeDeployments) {
  console.log(`Deploying ${dep.name} from ${dep.entry}...`);
  await uploadWorker(dep);
  console.log(`Uploaded ${dep.name}.`);
  const secretResults = [];
  for (const secretName of dep.secrets) {
    console.log(`Setting secret ${secretName} for ${dep.name}...`);
    secretResults.push(await setSecret(dep.name, secretName, secrets[secretName]));
  }
  console.log(`Updating routes for ${dep.name}...`);
  const routes = await upsertRoutes(zoneId, dep);
  console.log(`Routes updated for ${dep.name}.`);
  summary.push({ worker: dep.name, secrets: secretResults, routes });
}

console.log(JSON.stringify({ ok: true, zoneId, summary }, null, 2));
