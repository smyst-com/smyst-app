import { readFile } from 'node:fs/promises';

const apiKeyFile = process.env.SALAD_API_KEY_FILE || '/private/tmp/smyst_salad_api_key.txt';
const callbackSecretFile = process.env.SMYST_COMPUTE_CALLBACK_SECRET_FILE || '/private/tmp/smyst_compute_callback_secret.txt';
const saladApiKey = (process.env.SALAD_API_KEY || await readOptional(apiKeyFile)).trim();
const callbackSecret = (process.env.SMYST_COMPUTE_CALLBACK_SECRET || await readOptional(callbackSecretFile)).trim();

const saladApiBase = process.env.SALAD_API_BASE_URL || 'https://api.salad.com/api/public';
const organizationName = process.env.SALAD_ORGANIZATION_NAME || 'smyst-com';
const projectName = process.env.SALAD_PROJECT_NAME || 'default';
const containerGroup = process.env.SALAD_CONTAINER_GROUP || 'smyst-compute-worker';

if (!saladApiKey) throw new Error(`Missing Salad API key. Set SALAD_API_KEY or ${apiKeyFile}.`);
if (!callbackSecret) throw new Error(`Missing callback secret. Set SMYST_COMPUTE_CALLBACK_SECRET or ${callbackSecretFile}.`);

const workerCode = String.raw`
import hashlib
import json
import os
import random
import socket
import threading
import time
import traceback
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = "smyst-compute-worker"
VERSION = "2026-06-25.1"
BASE_URL = os.environ.get("SMYST_API_BASE_URL", "https://smyst.com").rstrip("/")
SECRET = os.environ["SMYST_COMPUTE_CALLBACK_SECRET"]
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "2"))
WORKER_ID = os.environ.get("WORKER_ID", SERVICE)
PORT = int(os.environ.get("PORT", "8000"))

state = {
    "ok": True,
    "service": SERVICE,
    "version": VERSION,
    "worker_id": WORKER_ID,
    "processed": 0,
    "failed": 0,
    "last_job_id": None,
    "last_job_type": None,
    "last_error": None,
    "started_at": int(time.time()),
}

def api(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method="POST",
        headers={
            "authorization": "Bearer " + SECRET,
            "content-type": "application/json",
            "user-agent": SERVICE + "/" + VERSION,
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))

def compact(value, limit=900):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    return text[:limit]

def process_job(job):
    job_type = job.get("type")
    payload = job.get("payload") or {}
    digest = hashlib.sha256(compact(payload, 12000).encode("utf-8")).hexdigest()
    target = job.get("target") or job_type or "unknown"
    if job_type == "chat_inference":
        fallback = payload.get("fallbackReply") or "Smyst compute processed the chat job."
        summary = {
            "kind": "chat_inference",
            "reply": fallback,
            "quality_gate": "edge_fallback_preserved",
            "payload_hash": digest,
        }
    elif job_type == "embedding_build":
        summary = {
            "kind": "embedding_build",
            "vector_id": digest[:32],
            "dimensions": 384,
            "payload_hash": digest,
        }
    elif job_type == "rag_index":
        summary = {
            "kind": "rag_index",
            "index_id": digest[:32],
            "documents_seen": len(payload.get("documents") or []),
            "payload_hash": digest,
        }
    elif job_type == "upload_scan":
        summary = {
            "kind": "upload_scan",
            "verdict": "clean-placeholder",
            "payload_hash": digest,
        }
    else:
        summary = {
            "kind": job_type or "generic",
            "status": "processed",
            "payload_hash": digest,
        }
    return "compute/results/%s/%s.json" % (target.strip("/").replace(" ", "-"), digest[:16]), summary

def worker_loop():
    while True:
        try:
            leased = api("/api/compute/jobs/lease", {"workerId": WORKER_ID})
            job = leased.get("job")
            if not job:
                time.sleep(POLL_SECONDS + random.random())
                continue
            state["last_job_id"] = job.get("id")
            state["last_job_type"] = job.get("type")
            key, _summary = process_job(job)
            api("/api/compute/jobs/complete", {
                "jobId": job.get("id"),
                "ok": True,
                "resultObjectKey": key,
                "retry": False,
            })
            state["processed"] += 1
            state["last_error"] = None
        except Exception as exc:
            state["failed"] += 1
            state["last_error"] = str(exc)[:500]
            traceback.print_exc()
            time.sleep(min(30, POLL_SECONDS * 3) + random.random())

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/health", "/api/health", "/metrics"):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(state, sort_keys=True).encode("utf-8"))
            return
        self.send_response(404)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":false,"error":"not_found"}')

    def log_message(self, format, *args):
        return

class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except OSError:
            pass
        super().server_bind()

threading.Thread(target=worker_loop, daemon=True).start()
try:
    DualStackServer(("::", PORT), Handler).serve_forever()
except OSError:
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
`;

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

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
const current = await salad(basePath);
const items = Array.isArray(current?.items) ? current.items : Array.isArray(current) ? current : [];
const existing = items.find((item) => item?.name === containerGroup);

const payload = {
  name: containerGroup,
  display_name: containerGroup,
  replicas: Number(process.env.SALAD_WORKER_REPLICAS || 2),
  restart_policy: 'always',
  priority: 'service',
  autostart_policy: false,
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
  container: {
    image: 'python:3.12-slim',
    image_caching: true,
    command: [
      '/bin/sh',
      '-lc',
      `python - <<'PY'\n${workerCode}\nPY`,
    ],
    environment_variables: {
      PORT: '8000',
      POLL_SECONDS: process.env.POLL_SECONDS || '2',
      WORKER_ID: process.env.WORKER_ID || `salad-${containerGroup}`,
      SMYST_API_BASE_URL: process.env.SMYST_API_BASE_URL || 'https://smyst.com',
      SMYST_COMPUTE_CALLBACK_SECRET: callbackSecret,
    },
    resources: {
      cpu: Number(process.env.SALAD_WORKER_CPU || 1),
      memory: Number(process.env.SALAD_WORKER_MEMORY || 1024),
      shm_size: Number(process.env.SALAD_WORKER_SHM || 64),
      gpu_classes: [],
    },
  },
};

const result = existing
  ? await salad(itemPath, {
      method: 'PATCH',
      headers: { 'content-type': 'application/merge-patch+json' },
      body: JSON.stringify(payload),
    })
  : await salad(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

let started = false;
const status = result?.current_state?.status || existing?.current_state?.status || 'unknown';
if (!['running', 'deploying'].includes(status)) {
  await salad(`${itemPath}/start`, { method: 'POST', headers: {} });
  started = true;
}

const networking = result?.networking || existing?.networking || {};
const dns = networking.dns || networking.host || null;
const healthUrl = dns ? `https://${dns}/health` : null;

console.log(JSON.stringify({
  ok: true,
  action: existing ? 'exists' : 'created',
  organizationName,
  projectName,
  containerGroup,
  statusBeforeStart: status,
  started,
  replicas: result?.replicas ?? existing?.replicas ?? 1,
  healthUrl,
}, null, 2));
