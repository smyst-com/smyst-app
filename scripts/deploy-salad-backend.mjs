// Turnkey-Deploy des API-Backends (backend/) auf SaladCloud — legacy-edge-frei.
//
// Macht in EINEM Lauf:
//   1) Docker-Image aus backend/ bauen
//   2) in eine Container-Registry pushen (Default: GHCR, öffentlich)
//   3) Salad-Container-Gruppe `smyst-backend-api` (Org smyst-com / Projekt default) anlegen/aktualisieren
//   4) starten und die öffentliche Health-/API-URL ausgeben
//
// DU tippst die Secrets in DEIN Terminal (nicht der Assistent). Beispiel:
//
//   export SALAD_API_KEY=...                 # Salad → API Access
//   export GOOGLE_OAUTH_CLIENT_SECRET=...    # Google Cloud Console (neues Secret)
//   export AUTH_SESSION_SECRET="$(openssl rand -base64 48)"
//   export IDRIVE_E2_ACCESS_KEY=...          # optional (für Storage/AI)
//   export IDRIVE_E2_SECRET_KEY=...          # optional
//   # Image-Registry (Default ghcr.io/smyst-com/smyst-backend:latest):
//   export IMAGE=ghcr.io/smyst-com/smyst-backend:latest
//   docker login ghcr.io                     # einmalig, falls noch nicht eingeloggt
//   node scripts/deploy-salad-backend.mjs
//
// Optional: --skip-build  (Image schon gepusht)  ·  --no-start  (nur anlegen)
//
// Hinweis: Salad zieht das Image öffentlich. Mache das GHCR-Package public, ODER
// setze REGISTRY_USERNAME + REGISTRY_PASSWORD für ein privates Image.

import { execFileSync } from 'node:child_process';

const argv = new Set(process.argv.slice(2));
const skipBuild = argv.has('--skip-build');
const noStart = argv.has('--no-start');

// ---- Pflicht-Env (Secrets kommen aus deinem Terminal) ----
const saladApiKey = (process.env.SALAD_API_KEY || '').trim();
if (!saladApiKey) throw new Error('Missing SALAD_API_KEY (Salad → API Access). In dein Terminal exportieren.');

const saladApiBase = process.env.SALAD_API_BASE_URL || 'https://api.salad.com/api/public';
const organizationName = process.env.SALAD_ORGANIZATION_NAME || 'smyst-com';
const projectName = process.env.SALAD_PROJECT_NAME || 'default';
const containerGroup = process.env.SALAD_CONTAINER_GROUP || 'smyst-backend-api';
const image = process.env.IMAGE || 'ghcr.io/smyst-com/smyst-backend:latest';

// ---- Backend-Runtime-Env (Defaults aus docs/runbooks/google-salad-auth.md) ----
const env = {
  APP_ENV: process.env.APP_ENV || 'production',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'https://smyst.com',
  AUTH_PUBLIC_BASE_URL: process.env.AUTH_PUBLIC_BASE_URL || 'https://api.smyst.com',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'https://smyst.com,https://app.smyst.com',
  GOOGLE_OAUTH_CLIENT_ID:
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    '449969912847-icfrvs99eee2rlaiosij3ck5f7dcbejh.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  GOOGLE_OAUTH_REDIRECT_URI:
    process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://api.smyst.com/auth/google/callback',
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || '',
  SMYST_OWNER_EMAILS: process.env.SMYST_OWNER_EMAILS || 'smyst247@gmail.com',
  SMYST_ADMIN_EMAILS: process.env.SMYST_ADMIN_EMAILS || '',
  IDRIVE_E2_ENDPOINT: process.env.IDRIVE_E2_ENDPOINT || 'https://s3.us-west-2.idrivee2.com',
  IDRIVE_E2_BUCKET: process.env.IDRIVE_E2_BUCKET || 'smyst-memories',
  IDRIVE_E2_REGION: process.env.IDRIVE_E2_REGION || 'us-west-2',
  RATE_LIMIT_REQUESTS: process.env.RATE_LIMIT_REQUESTS || '120',
  RATE_LIMIT_WINDOW_SECONDS: process.env.RATE_LIMIT_WINDOW_SECONDS || '60',
  HEALTH_REQUIRE_POSTGRES: process.env.HEALTH_REQUIRE_POSTGRES || 'false',
  HEALTH_REQUIRE_REDIS: process.env.HEALTH_REQUIRE_REDIS || 'false',
};
// Optionale Secrets nur setzen, wenn vorhanden:
for (const k of [
  'IDRIVE_E2_ACCESS_KEY',
  'IDRIVE_E2_SECRET_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'MOONSHOT_API_KEY',
  'MANUS_API_KEY',
  'ZHIPU_API_KEY',
  'DASHSCOPE_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'TOGETHER_API_KEY',
  'COHERE_API_KEY',
  'PERPLEXITY_API_KEY',
  'LLM_PROVIDER_ORDER',
  'LLM_DEFAULT_MODELS',
]) {
  if (process.env[k]) env[k] = process.env[k];
}

// Frühe, klare Warnungen statt halber Deploys:
const missing = [];
if (!env.GOOGLE_OAUTH_CLIENT_SECRET) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
if (!env.AUTH_SESSION_SECRET || Buffer.byteLength(env.AUTH_SESSION_SECRET) < 32)
  missing.push('AUTH_SESSION_SECRET (mind. 32 Byte)');
if (missing.length) {
  console.error(`Fehlende/zu kurze Secrets: ${missing.join(', ')}. In dein Terminal exportieren und erneut starten.`);
  process.exit(1);
}

function sh(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

// ---- 1+2) Build & Push ----
if (!skipBuild) {
  sh('docker', ['build', '-t', image, 'backend']);
  sh('docker', ['push', image]);
} else {
  console.log('--skip-build gesetzt: nutze bestehendes Image', image);
}

// ---- Salad-API-Helfer (Muster aus deploy-salad-compute-worker.mjs) ----
async function salad(path, init = {}) {
  const response = await fetch(`${saladApiBase}${path}`, {
    ...init,
    headers: {
      'Salad-Api-Key': saladApiKey,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${path} failed ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

const basePath = `/organizations/${organizationName}/projects/${projectName}/containers`;
const itemPath = `${basePath}/${containerGroup}`;

const containerSpec = {
  image,
  image_caching: true,
  environment_variables: env,
  resources: {
    cpu: Number(process.env.SALAD_CPU || 1),
    memory: Number(process.env.SALAD_MEMORY || 1024),
    gpu_classes: [],
  },
};
// Privates Image? Registry-Auth mitgeben.
if (process.env.REGISTRY_USERNAME && process.env.REGISTRY_PASSWORD) {
  containerSpec.registry_authentication = {
    basic: { username: process.env.REGISTRY_USERNAME, password: process.env.REGISTRY_PASSWORD },
  };
}

const payload = {
  name: containerGroup,
  display_name: containerGroup,
  replicas: Number(process.env.SALAD_REPLICAS || 1),
  restart_policy: 'always',
  priority: 'service',
  autostart_policy: true,
  country_codes: [],
  networking: {
    port: 8000,
    protocol: 'http',
    auth: false,
    client_request_timeout: 100000,
    server_response_timeout: 100000,
    load_balancer: 'least_number_of_connections',
    single_connection_limit: false,
  },
  container: containerSpec,
};

const current = await salad(basePath).catch(() => null);
const items = Array.isArray(current?.items) ? current.items : Array.isArray(current) ? current : [];
const existing = items.find((item) => item?.name === containerGroup);

const result = existing
  ? await salad(itemPath, {
      method: 'PATCH',
      headers: { 'content-type': 'application/merge-patch+json' },
      body: JSON.stringify({ container: containerSpec, replicas: payload.replicas, networking: payload.networking }),
    })
  : await salad(basePath, { method: 'POST', body: JSON.stringify(payload) });

let started = false;
const status = result?.current_state?.status || existing?.current_state?.status || 'unknown';
if (!noStart && !['running', 'deploying'].includes(status)) {
  await salad(`${itemPath}/start`, { method: 'POST', headers: {} });
  started = true;
}

const networking = result?.networking || existing?.networking || {};
const dns = networking.dns || networking.host || null;

console.log(JSON.stringify({
  ok: true,
  action: existing ? 'updated' : 'created',
  organizationName,
  projectName,
  containerGroup,
  image,
  statusBeforeStart: status,
  started,
  endpoint: dns ? `https://${dns}` : '(URL erscheint im Salad-Portal, sobald deployed)',
  health: dns ? `https://${dns}/api/v1/health/live` : null,
  readiness: dns ? `https://${dns}/api/v1/health/ready` : null,
  next: 'DNS: api.smyst.com -> obigen Salad-Endpoint (CNAME), dann VITE_AUTH_BASE_URL ist bereits https://api.smyst.com/auth',
}, null, 2));
