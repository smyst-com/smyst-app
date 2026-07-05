// Deploy des smyst.com Voice-Workers (voice-worker/) auf SaladCloud (GPU).
// Muster: scripts/deploy-salad-backend.mjs. Wird vom Workflow
// "Voice Worker Deploy" mit --skip-build aufgerufen (Image via GHCR).
//
// Kostenprinzip (Option A, Freigabe Adam King): guenstigste passende
// Consumer-GPU, 1 Replica. Stoppen jederzeit im Salad-Portal ("Stop") oder
// via API — dann fallen keine Kosten mehr an; das Backend faellt automatisch
// auf die Piper-Stimmen (Phase 1) zurueck.

const argv = new Set(process.argv.slice(2));
const noStart = argv.has('--no-start');

const saladApiKey = (process.env.SALAD_API_KEY || '').trim();
if (!saladApiKey) throw new Error('Missing SALAD_API_KEY');
const workerToken = (process.env.WORKER_TOKEN || '').trim();
if (workerToken.length < 24) throw new Error('Missing/short WORKER_TOKEN');

const saladApiBase = process.env.SALAD_API_BASE_URL || 'https://api.salad.com/api/public';
const organizationName = process.env.SALAD_ORGANIZATION_NAME || 'smyst-com';
const projectName = process.env.SALAD_PROJECT_NAME || 'default';
const containerGroup = process.env.SALAD_CONTAINER_GROUP || 'smyst-voice-worker';
const image = process.env.IMAGE || 'ghcr.io/smyst-com/smyst-voice-worker:latest';

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

// ---- GPU-Klasse waehlen: guenstigste aus der Praeferenzliste ----
const preferred = (process.env.SALAD_GPU_PREFERENCE ||
  'rtx 3060,rtx 2080,rtx 3060 ti,rtx 3070,rtx 4060,rtx 2070')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const gpuResponse = await salad(`/organizations/${organizationName}/gpu-classes`);
const gpuClasses = Array.isArray(gpuResponse?.items) ? gpuResponse.items : [];
if (!gpuClasses.length) throw new Error('No GPU classes returned by Salad API');

function priceOf(gpuClass) {
  const prices = Array.isArray(gpuClass?.prices) ? gpuClass.prices : [];
  const entry = prices.find((p) => (p?.priority || '').toLowerCase() === 'high') || prices[0];
  const value = Number(entry?.price ?? entry?.amount ?? NaN);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

let chosen = null;
for (const wanted of preferred) {
  const matches = gpuClasses.filter((g) => (g?.name || '').toLowerCase().includes(wanted));
  if (matches.length) {
    matches.sort((a, b) => priceOf(a) - priceOf(b));
    chosen = matches[0];
    break;
  }
}
if (!chosen) {
  const sorted = [...gpuClasses].sort((a, b) => priceOf(a) - priceOf(b));
  chosen = sorted[0];
}
console.log(`GPU-Klasse: ${chosen.name} (id ${chosen.id}, Preis ~${priceOf(chosen)}/h)`);

const containerSpec = {
  image,
  image_caching: true,
  environment_variables: {
    WORKER_TOKEN: workerToken,
    HF_HOME: '/tmp/hf',
  },
  resources: {
    cpu: Number(process.env.SALAD_CPU || 4),
    memory: Number(process.env.SALAD_MEMORY || 12288),
    gpu_classes: [chosen.id],
  },
};
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
  priority: 'high',
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

const basePath = `/organizations/${organizationName}/projects/${projectName}/containers`;
const itemPath = `${basePath}/${containerGroup}`;

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
  containerGroup,
  image,
  gpuClass: chosen.name,
  statusBeforeStart: status,
  started,
  endpoint: dns ? `https://${dns}` : '(URL erscheint im Salad-Portal, sobald deployed)',
  health: dns ? `https://${dns}/health/ready` : null,
  next: 'Repo-Variable VOICE_WORKER_URL auf den endpoint setzen und Salad Backend Deploy erneut ausfuehren.',
}, null, 2));

