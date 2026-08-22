// Deploy des smyst-1.0-LLM-Servers (llama.cpp, CPU) auf SaladCloud.
// Muster: scripts/deploy-salad-voice-worker.mjs — aber CPU statt GPU (kein
// gpu_class), Port 8080, Health-Check gegen llama-server /health.
//
// Kostenprinzip (wie Voice-Worker Option A): kleinste CPU-Klasse, 1 Replica.
// Stoppen jederzeit im Salad-Portal oder via API — keine Kosten mehr, die
// Pipeline faellt automatisch zurueck auf groq/gateway (Provider smyst_llm
// wird nur aktiv, wenn SMYST_LLM_BASE_URL gesetzt ist).

import { appendFileSync } from 'node:fs';

const argv = new Set(process.argv.slice(2));
const noStart = argv.has('--no-start');

const saladApiKey = (process.env.SALAD_API_KEY || '').trim();
if (!saladApiKey) throw new Error('Missing SALAD_API_KEY');
// API-Key OPTIONAL: ohne Key laeuft der Endpoint offen — genau wie beim
// Voice-Worker liegt die Sicherheit dann im unerratbaren Salad-DNS-Namen.
const llmApiKey = (process.env.LLM_API_KEY || '').trim();
if (llmApiKey && llmApiKey.length < 24) throw new Error('LLM_API_KEY too short');

const saladApiBase = process.env.SALAD_API_BASE_URL || 'https://api.salad.com/api/public';
const organizationName = process.env.SALAD_ORGANIZATION_NAME || 'smyst-com';
const projectName = process.env.SALAD_PROJECT_NAME || 'default';
const containerGroup = process.env.SALAD_CONTAINER_GROUP || 'smyst-llm';
const image = process.env.IMAGE || 'ghcr.io/smyst-com/smyst-llm:latest';

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

const containerSpec = {
  image,
  resources: {
    cpu: Number(process.env.SALAD_CPU || 2),
    // Salad erwartet Speicher in MB (Validierung 1024..1073741824, Fehler
    // 05:28 UTC). gpu_class/vram_gb bewusst GANZ WEGLASSEN: explizites null
    // hielt die Gruppe 40+ Min im Zustand 'allocating' fest (06:08 UTC,
    // allocating_count: 1, running: 0) — ohne die Felder ist es eine
    // normale CPU-Gruppe, die jeden Knoten annehmen darf.
    memory: 3072,
  },
  command: [],
  environment_variables: llmApiKey ? { LLM_API_KEY: llmApiKey } : {},
  logging: { isEnabled: true },
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
    port: 8080,
    protocol: 'http',
    auth: false,
    client_request_timeout: 90000,
    server_response_timeout: 90000,
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

let restarted = false;
const status = result?.current_state?.status || existing?.current_state?.status || 'unknown';
if (!noStart && existing && ['running', 'deploying'].includes(status)) {
  try {
    await salad(`${itemPath}/stop`, { method: 'POST', headers: {} });
    restarted = true;
  } catch (exc) {
    console.log(`Stop uebersprungen: ${exc.message}`);
  }
}
if (!noStart && (['stopped', 'failed'].includes(status) || restarted)) {
  try {
    await salad(`${itemPath}/start`, { method: 'POST', headers: {} });
  } catch (exc) {
    console.log(`Start uebersprungen: ${exc.message}`);
  }
}

const networking = result?.networking || existing?.networking || {};
const dns = networking.dns || networking.host || null;
const endpoint = dns ? `https://${dns}` : '';
const health = dns ? `${endpoint}/health` : '';

async function waitForReady() {
  if (!endpoint) return null;
  const waitSeconds = Number(process.env.SALAD_LLM_HEALTH_WAIT_SECONDS || 1800);
  const intervalMs = Number(process.env.SALAD_LLM_HEALTH_INTERVAL_MS || 10000);
  const deadline = Date.now() + waitSeconds * 1000;
  let last = 'not checked yet';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(health, { signal: AbortSignal.timeout(10000) });
      last = `health=${response.status}`;
      if (response.ok) return { health, last };
    } catch (exc) {
      last = exc instanceof Error ? exc.message : String(exc);
    }
    console.log(`Waiting for LLM readiness: ${last}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`LLM did not become ready within ${waitSeconds}s. Last: ${last}`);
}

const readinessCheck = !noStart ? await waitForReady() : null;

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `endpoint=${endpoint}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `health=${health}\n`);
}

console.log(JSON.stringify({
  ok: true,
  action: existing ? 'updated' : 'created',
  containerGroup,
  image,
  statusBeforeStart: status,
  endpoint: endpoint || '(URL im Salad-Portal)',
  readinessCheck,
  next: 'Repo-Variable SMYST_LLM_BASE_URL=<endpoint>/v1 setzen; Pipeline-Workflows reichen sie als Env durch.',
}, null, 2));
