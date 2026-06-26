/**
 * Smyst API Worker — free-only chat and platform API.
 *
 * This worker provides small, fast API endpoints without paid services.
 * It stores only lightweight state in Cloudflare KV. Files and backups stay in
 * IDrive e2 through the storage worker.
 */

import type { AuthEnv } from './auth-github';
import {
  clientKey,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  readJsonBody,
  requireDeleteConfirmation,
  requireSameOrigin,
  requireRateLimit,
  safeHandler,
  strictCorsPreflight,
  withSecurity,
} from './_shared';
import {
  CURATED_PUBLIC_TWIN_BASE_TIME,
  CURATED_PUBLIC_TWIN_LANGUAGES,
  CURATED_PUBLIC_TWIN_SPECS,
} from './curated-public-twin-data';

export interface ApiEnv extends AuthEnv {
  METADATA?: KVNamespace;
  SALAD_API_BASE_URL?: string;
  SALAD_ORGANIZATION_NAME?: string;
  SALAD_PROJECT_NAME?: string;
  SALAD_CONTAINER_GROUP?: string;
  SALAD_CONTAINER_HEALTH_URL?: string;
  SALAD_API_KEY?: string;
  SMYST_COMPUTE_CALLBACK_SECRET?: string;
  SMYST_AI_ROUTER_MODE?: string;
  SMYST_AI_PRIMARY_PROVIDER?: string;
  SMYST_AI_MODEL_FAST?: string;
  SMYST_AI_MODEL_REASONING?: string;
  SMYST_AI_MODEL_RAG?: string;
  SMYST_AI_STREAMING_ENABLED?: string;
}

const SESSION_COOKIE = 'smyst_session';
const MAX_MESSAGE_CHARS = 2000;
const MAX_CHAT_MESSAGES = 20;
const MAX_RECENT_PROFILE_PROMPTS = 8;
const MAX_TWIN_NAME_CHARS = 120;
const MAX_TWIN_DESCRIPTION_CHARS = 2000;
const MAX_TWIN_KNOWLEDGE_CHARS = 12000;
const MAX_KNOWLEDGE_ITEMS = 20;
const MAX_TWIN_MEDIA_REFS = 50;
const MAX_PROFILE_BIO_CHARS = 2400;
const MAX_PROFILE_PUBLIC_BIO_CHARS = 700;
const MAX_PROFILE_FIELD_CHARS = 80;
const MAX_PROFILE_ITEMS = 12;
const MAX_MEMORY_TEXT_CHARS = 1200;
const MAX_MEMORY_SOURCE_CHARS = 280;
const MAX_MEMORY_ITEMS = 100;
const MAX_CHAT_SEARCH_QUERY_CHARS = 120;
const MAX_INDEX_READS = 50;
const MAX_PUBLIC_DISCOVERY_READS = 100;
const MAX_REPORT_SUBJECT_CHARS = 160;
const MAX_REPORT_MESSAGE_CHARS = 4000;
const MAX_REPORT_CONTACT_CHARS = 180;
const TWIN_TTL_SECONDS = 60 * 60 * 24 * 370;
const PROFILE_TTL_SECONDS = 60 * 60 * 24 * 370;
const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 370;
const REPORT_TTL_SECONDS = 60 * 60 * 24 * 370;
const ADMIN_STATE_TTL_SECONDS = 60 * 60 * 24 * 370;
const ADMIN_AUDIT_TTL_SECONDS = 60 * 60 * 24 * 370;
const MAX_ADMIN_LIST = 100;
const MAX_ADMIN_AUDIT = 200;
const MAX_REVENUE_SLUG_CHARS = 80;
const MAX_COMPUTE_JOBS = 200;
const COMPUTE_JOB_TTL_SECONDS = 60 * 60 * 24 * 30;
const COMPUTE_LEASE_SECONDS = 120;
const MAX_COMPUTE_PAYLOAD_CHARS = 20000;
const SUPPORTED_PROFILE_LANGS = new Set(['de', 'en', 'tr', 'fr', 'es', 'pt', 'ar', 'zh', 'ja', 'ko']);
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{40,96}$/;

function allowedMethodsForApiPath(pathname: string): string[] | null {
  if (pathname === '/api/health') return ['GET'];
  if (pathname === '/api/compute/capabilities') return ['GET'];
  if (pathname === '/api/compute/jobs/lease') return ['POST'];
  if (pathname === '/api/compute/jobs/complete') return ['POST'];
  if (pathname === '/api/admin/overview') return ['GET'];
  if (pathname === '/api/admin/compute/jobs') return ['GET', 'POST'];
  if (pathname === '/api/admin/compute/runtime') return ['GET', 'POST'];
  if (pathname === '/api/admin/users') return ['GET'];
  if (pathname === '/api/admin/users/block') return ['POST'];
  if (pathname === '/api/admin/users/unblock') return ['POST'];
  if (pathname === '/api/admin/revenue/summary') return ['GET'];
  if (pathname === '/api/admin/revenue/events') return ['POST'];
  if (pathname === '/api/admin/revenue/hold') return ['POST'];
  if (pathname === '/api/admin/audit') return ['GET'];
  if (pathname === '/api/profile') return ['GET', 'PATCH'];
  if (pathname === '/api/account/export') return ['GET'];
  if (pathname === '/api/account') return ['DELETE'];
  if (pathname === '/api/support/report') return ['POST'];
  if (pathname === '/api/public/twins') return ['GET'];
  if (pathname.startsWith('/api/public/twin-images/')) return ['GET', 'HEAD'];
  if (pathname.startsWith('/api/public/twins/')) return ['GET'];
  if (pathname === '/api/chat/start') return ['POST'];
  if (pathname === '/api/chat/messages') return ['POST'];
  if (pathname === '/api/chat/list') return ['GET'];
  if (pathname === '/api/chat/search') return ['GET'];
  if (pathname === '/api/memories') return ['GET', 'POST'];
  if (pathname.startsWith('/api/memories/')) return ['GET', 'PATCH', 'DELETE'];
  if (pathname === '/api/twins') return ['GET', 'POST'];
  if (pathname === '/api/twins/knowledge') return ['POST'];
  if (pathname === '/api/twins/media') return ['POST'];
  if (pathname.startsWith('/api/twins/')) return ['GET', 'PATCH'];
  return null;
}

interface SessionData {
  sub: string;
  email: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
  adminMfaVerifiedAt?: number;
  adminMfaExpiresAt?: number;
  adminMfaMethod?: 'totp';
  expiresAt: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface ChatRecord {
  id: string;
  userSub: string;
  title: string;
  twinId?: string;
  publicTwinSlug?: string;
  messages: ChatMessage[];
  summary?: string;
  archiveObjectKey?: string;
  sensitivity?: SensitivityLevel;
  visibility?: ProfileVisibility;
  createdAt: number;
  updatedAt: number;
}

interface ChatRecentPromptMemory {
  questions: string[];
  updatedAt: number;
}

interface ChatStartRequest {
  twinId?: string;
}

interface ChatMessageRequest {
  chatId: string;
  message: string;
}

type ProfileVisibility = 'private' | 'shared' | 'public_snapshot' | 'deleted';
type SensitivityLevel = 'normal' | 'personal' | 'sensitive';
type MemoryStatus = 'pending' | 'confirmed' | 'edited' | 'rejected';
type MemoryType = 'fact' | 'preference' | 'goal' | 'relationship' | 'project' | 'style' | 'decision' | 'warning' | 'sensitive';

interface ProfileRecord {
  id: 'default';
  userSub: string;
  displayName: string;
  headline?: string;
  privateBio?: string;
  publicBio?: string;
  roles: string[];
  expertise: string[];
  goals: string[];
  languages: string[];
  tone: string;
  visibility: ProfileVisibility;
  qualityScore: number;
  memoryCount: number;
  chatCount: number;
  objectPrefix: string;
  createdAt: number;
  updatedAt: number;
}

interface ProfileUpdateRequest {
  displayName?: string;
  headline?: string;
  privateBio?: string;
  publicBio?: string;
  roles?: string[];
  expertise?: string[];
  goals?: string[];
  languages?: string[];
  tone?: string;
  visibility?: ProfileVisibility;
}

interface MemoryRecord {
  id: string;
  userSub: string;
  profileId: 'default';
  type: MemoryType;
  text: string;
  source: {
    type: 'chat' | 'upload' | 'profile' | 'manual';
    chatId?: string;
    uploadId?: string;
    label?: string;
  };
  visibility: ProfileVisibility;
  sensitivity: SensitivityLevel;
  confidence: number;
  status: MemoryStatus;
  twinIds: string[];
  reviewAt?: number;
  objectKey: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryWriteRequest {
  type?: MemoryType;
  text?: string;
  sourceType?: 'chat' | 'upload' | 'profile' | 'manual';
  chatId?: string;
  uploadId?: string;
  sourceLabel?: string;
  visibility?: ProfileVisibility;
  sensitivity?: SensitivityLevel;
  confidence?: number;
  status?: MemoryStatus;
  twinIds?: string[];
  reviewAt?: number;
}

type TwinVisibility = 'private' | 'public';
type TwinStyle = 'warm' | 'direct' | 'humorous' | 'wise' | 'neutral';

interface TwinKnowledgeItem {
  id: string;
  title?: string;
  text: string;
  createdAt: number;
}

interface TwinMediaRef {
  id: string;
  uploadId?: string;
  key: string;
  category: string;
  contentType?: string;
  filename?: string;
  size?: number;
  createdAt: number;
}

interface TwinRecord {
  id: string;
  userSub: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  imageKey?: string;
  categories: string[];
  languages: string[];
  visibility: TwinVisibility;
  style: TwinStyle;
  knowledgeTexts: TwinKnowledgeItem[];
  mediaRefs: TwinMediaRef[];
  contextSummary: string;
  guardrail?: string;
  rightsPosture?: string;
  answerStyle?: string;
  releaseStatus?: string;
  mainCategory?: string;
  birthDate?: string;
  deathDate?: string;
  birthYear?: number;
  deathYear?: number;
  birthLabel?: string;
  deathLabel?: string;
  sources?: Array<{ title: string; publisher: string; url: string }>;
  exampleQuestions?: string[];
  searchIndex?: string;
  status: 'draft' | 'ready';
  createdAt: number;
  updatedAt: number;
}

interface TwinCreateRequest {
  name?: string;
  description?: string;
  imageUrl?: string;
  imageKey?: string;
  categories?: string[];
  languages?: string[];
  visibility?: TwinVisibility;
  style?: TwinStyle;
  slug?: string;
}

interface TwinUpdateRequest {
  name?: string;
  description?: string;
  imageUrl?: string;
  imageKey?: string;
  categories?: string[];
  languages?: string[];
  visibility?: TwinVisibility;
  style?: TwinStyle;
  slug?: string;
}

interface TwinKnowledgeRequest {
  twinId?: string;
  title?: string;
  text?: string;
}

interface TwinMediaRequest {
  twinId?: string;
  uploadId?: string;
  key?: string;
  category?: string;
  contentType?: string;
  filename?: string;
  size?: number;
}

interface AccountDeleteRequest {
  confirm?: string;
}

type SupportReportType = 'bug' | 'abuse' | 'privacy' | 'safety' | 'feedback';

interface SupportReportRequest {
  type?: SupportReportType;
  subject?: string;
  message?: string;
  url?: string;
  contact?: string;
}

interface SupportReportRecord {
  id: string;
  type: SupportReportType;
  subject: string;
  message: string;
  url?: string;
  contact?: string;
  userSub?: string;
  userEmail?: string;
  clientKey: string;
  createdAt: number;
  status: 'open';
}

type AdminUserStatus = 'active' | 'review' | 'blocked';
type AdminRiskLevel = 'low' | 'medium' | 'high';
type RevenueStatus = 'payable' | 'review' | 'hold' | 'policy';

interface AdminUserState {
  userSub: string;
  email?: string;
  status: AdminUserStatus;
  risk: AdminRiskLevel;
  blockedAt?: number;
  blockedBy?: string;
  blockReason?: string;
  payoutHold?: boolean;
  payoutHoldReason?: string;
  updatedAt: number;
}

interface AdminUserActionRequest {
  userSub?: string;
  email?: string;
  reason?: string;
  risk?: AdminRiskLevel;
}

interface AdminAuditRecord {
  id: string;
  actorSub: string;
  actorEmail: string;
  action: string;
  target?: string;
  detail?: string;
  createdAt: number;
}

interface RevenueAggregate {
  slug: string;
  ownerSub?: string;
  ownerEmail?: string;
  profileName?: string;
  impressions: number;
  clicks: number;
  validRevenueCents: number;
  invalidRevenueCents: number;
  userShareCents: number;
  heldCents: number;
  payableCents: number;
  status: RevenueStatus;
  updatedAt: number;
}

interface RevenueEventRequest {
  slug?: string;
  profileName?: string;
  ownerSub?: string;
  ownerEmail?: string;
  impressions?: number;
  clicks?: number;
  validRevenueCents?: number;
  invalidRevenueCents?: number;
  source?: string;
}

interface RevenueHoldRequest {
  slug?: string;
  hold?: boolean;
  reason?: string;
}

type ComputeJobType =
  | 'chat_inference'
  | 'rag_index'
  | 'embedding_build'
  | 'upload_scan'
  | 'media_preview'
  | 'search_index'
  | 'payout_batch'
  | 'backup_verify';
type ComputeJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface ComputeJobRecord {
  id: string;
  type: ComputeJobType;
  status: ComputeJobStatus;
  priority: number;
  target: string;
  payload?: unknown;
  idempotencyKey?: string;
  userSub?: string;
  provider: 'salad' | 'cloudflare-fallback';
  attempts: number;
  maxAttempts: number;
  leaseUntil?: number;
  nextRunAt?: number;
  resultObjectKey?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

interface ComputeJobCreateRequest {
  type?: string;
  priority?: number;
  target?: string;
  payload?: unknown;
  idempotencyKey?: string;
  maxAttempts?: number;
}

interface ComputeJobCompleteRequest {
  jobId?: string;
  ok?: boolean;
  resultObjectKey?: string;
  error?: string;
  retry?: boolean;
}

interface ComputeJobInput {
  type: ComputeJobType;
  priority?: number;
  target: string;
  payload?: unknown;
  idempotencyKey?: string;
  maxAttempts?: number;
  userSub?: string;
}

const COMPUTE_JOB_TYPES = new Set<ComputeJobType>([
  'chat_inference',
  'rag_index',
  'embedding_build',
  'upload_scan',
  'media_preview',
  'search_index',
  'payout_batch',
  'backup_verify',
]);

function metadataStore(env: ApiEnv): KVNamespace {
  return env.METADATA ?? env.SESSIONS;
}

function adminUserStateKey(userSub: string): string {
  return `admin:user:${safePathSegment(userSub)}`;
}

function adminAuditKey(createdAt: number, id: string): string {
  return `admin:audit:${createdAt}:${id}`;
}

function adminAuditIndexKey(): string {
  return 'admin:audit:index';
}

function revenueProfileKey(slug: string): string {
  return `admin:revenue:profile:${slugify(slug).slice(0, MAX_REVENUE_SLUG_CHARS)}`;
}

function revenueIndexKey(): string {
  return 'admin:revenue:index';
}

function computeJobKey(jobId: string): string {
  return `compute:job:${safePathSegment(jobId)}`;
}

function computeJobIndexKey(): string {
  return 'compute:jobs:index';
}

function normalizeComputeJobType(value: unknown): ComputeJobType | null {
  const type = typeof value === 'string' ? value.trim() : '';
  return COMPUTE_JOB_TYPES.has(type as ComputeJobType) ? type as ComputeJobType : null;
}

function safeComputePayload(value: unknown): unknown {
  if (value === undefined) return undefined;
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_COMPUTE_PAYLOAD_CHARS) {
    return { truncated: true, bytes: encoded.length };
  }
  return JSON.parse(encoded);
}

async function loadComputeJobs(env: ApiEnv, limit = MAX_COMPUTE_JOBS): Promise<ComputeJobRecord[]> {
  const kv = metadataStore(env);
  const ids = (await getStringArray(kv, computeJobIndexKey())).slice(0, Math.min(limit, MAX_COMPUTE_JOBS));
  const records = await Promise.all(ids.map((id) => kv.get(computeJobKey(id), 'json') as Promise<ComputeJobRecord | null>));
  return records.filter((record): record is ComputeJobRecord => Boolean(record));
}

async function putComputeJob(env: ApiEnv, job: ComputeJobRecord): Promise<void> {
  await metadataStore(env).put(computeJobKey(job.id), JSON.stringify(job), {
    expirationTtl: COMPUTE_JOB_TTL_SECONDS,
  });
}

async function addComputeJobToIndex(env: ApiEnv, jobId: string): Promise<void> {
  const kv = metadataStore(env);
  const current = await getStringArray(kv, computeJobIndexKey());
  const next = [jobId, ...current.filter((id) => id !== jobId)].slice(0, MAX_COMPUTE_JOBS);
  await kv.put(computeJobIndexKey(), JSON.stringify(next), { expirationTtl: COMPUTE_JOB_TTL_SECONDS });
}

function summarizeComputeJobs(jobs: ComputeJobRecord[]) {
  const summary = {
    total: jobs.length,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    retryable: 0,
    staleRunning: 0,
  };
  const now = Date.now();
  for (const job of jobs) {
    summary[job.status] += 1;
    if (job.status === 'queued' && job.nextRunAt && job.nextRunAt > now) summary.retryable += 1;
    if (job.status === 'running' && job.leaseUntil && job.leaseUntil <= now) summary.staleRunning += 1;
  }
  return summary;
}

async function enqueueComputeJob(env: ApiEnv, input: ComputeJobInput): Promise<{ job: ComputeJobRecord; reused: boolean }> {
  const idempotencyKey = sanitizeText(input.idempotencyKey, 160) || undefined;
  const existing = idempotencyKey
    ? (await loadComputeJobs(env, MAX_COMPUTE_JOBS)).find((job) => job.idempotencyKey === idempotencyKey)
    : null;
  if (existing) return { job: existing, reused: true };

  const now = Date.now();
  const compute = computeConfiguration(env);
  const job: ComputeJobRecord = {
    id: crypto.randomUUID(),
    type: input.type,
    status: 'queued',
    priority: count(input.priority, 100),
    target: sanitizeText(input.target, 240) || input.type,
    payload: safeComputePayload(input.payload),
    idempotencyKey,
    userSub: input.userSub,
    provider: compute.ready ? 'salad' : 'cloudflare-fallback',
    attempts: 0,
    maxAttempts: Math.max(1, Math.min(8, count(input.maxAttempts, 3) || 3)),
    createdAt: now,
    updatedAt: now,
  };
  await Promise.all([putComputeJob(env, job), addComputeJobToIndex(env, job.id)]);
  return { job, reused: false };
}

function requireComputeCallback(request: Request, env: ApiEnv): Response | null {
  const secret = envText(env.SMYST_COMPUTE_CALLBACK_SECRET);
  if (!secret) return errorResponse('compute_callback_secret_missing', 'Compute callback secret is not configured.', 503);
  const expected = `Bearer ${secret}`;
  if (request.headers.get('Authorization') !== expected) {
    return errorResponse('unauthorized_compute_worker', 'Compute worker authorization failed.', 401);
  }
  return null;
}

function envText(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function envFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(envText(value).toLowerCase());
}

function computeConfiguration(env: ApiEnv) {
  const missing = [
    !envText(env.SALAD_API_BASE_URL) && 'SALAD_API_BASE_URL',
    !envText(env.SALAD_ORGANIZATION_NAME) && 'SALAD_ORGANIZATION_NAME',
    !envText(env.SALAD_PROJECT_NAME) && 'SALAD_PROJECT_NAME',
    !envText(env.SALAD_CONTAINER_GROUP) && 'SALAD_CONTAINER_GROUP',
    !envText(env.SALAD_API_KEY) && 'SALAD_API_KEY',
    !envText(env.SMYST_COMPUTE_CALLBACK_SECRET) && 'SMYST_COMPUTE_CALLBACK_SECRET',
  ].filter((item): item is string => Boolean(item));
  const ready = missing.length === 0;
  return {
    ready,
    status: ready ? 'ready' : 'blocked',
    missing,
    requiredSecrets: ['SALAD_API_KEY', 'SMYST_COMPUTE_CALLBACK_SECRET'],
    requiredVars: ['SALAD_API_BASE_URL', 'SALAD_ORGANIZATION_NAME', 'SALAD_PROJECT_NAME', 'SALAD_CONTAINER_GROUP'],
    mode: ready ? envText(env.SMYST_AI_ROUTER_MODE) || 'salad-production' : 'cloudflare-fallback',
    primaryProvider: ready ? envText(env.SMYST_AI_PRIMARY_PROVIDER) || 'salad' : 'rule-based-mvp',
    streamingEnabled: ready && envFlag(env.SMYST_AI_STREAMING_ENABLED),
    note: ready
      ? 'Compute worker can route heavy AI, RAG, embeddings, search and cron jobs through Salad.'
      : 'Cloudflare API stays in deterministic fallback mode until Salad vars and secret are configured.',
  };
}

function computeCapabilities(env: ApiEnv) {
  const configuration = computeConfiguration(env);
  return {
    ok: true,
    service: 'smyst-api',
    phase: 'phase-1-production-foundation',
    provider: configuration.ready ? 'Salad Compute' : 'Cloudflare Workers fallback',
    configuration,
    modelRouting: {
      fast: envText(env.SMYST_AI_MODEL_FAST) || 'free-only-rule-based-fast',
      reasoning: envText(env.SMYST_AI_MODEL_REASONING) || 'pending-salad-reasoning',
      rag: envText(env.SMYST_AI_MODEL_RAG) || 'pending-salad-rag',
      supportedTargets: ['fast-chat', 'deep-reasoning', 'rag-verified', 'safety-rewrite', 'embeddings', 'search-indexing', 'cron-batch'],
    },
    routingRules: {
      cloudflareWorkers: 'session, auth, lightweight API and deterministic fallback replies',
      idriveE2: 'persistent objects, uploads, RAG documents, embeddings, archives and release artifacts',
      salad: 'stateless compute for AI responses, RAG processing, embeddings, search, media jobs and cron batches',
      github: 'code and versioning only',
    },
    saladRuntime: {
      apiBaseUrl: envText(env.SALAD_API_BASE_URL) || null,
      organizationName: envText(env.SALAD_ORGANIZATION_NAME) || null,
      projectName: envText(env.SALAD_PROJECT_NAME) || null,
      containerGroup: envText(env.SALAD_CONTAINER_GROUP) || null,
      healthUrl: envText(env.SALAD_CONTAINER_HEALTH_URL) || null,
    },
    latencyBudgetMs: {
      chatStart: 150,
      firstToken: configuration.streamingEnabled ? 350 : 1200,
      fallbackReply: 900,
      heavyJobQueueAck: 500,
    },
    safety: {
      noSecretEcho: true,
      noLongTermStorageOnSalad: true,
      retryPolicy: 'idempotency-key + timeout + retry queue before durable persist to IDrive e2',
      fallbackPolicy: 'serve deterministic Cloudflare response if compute is missing, timed out or unhealthy',
    },
    queueApi: {
      adminJobs: '/api/admin/compute/jobs',
      lease: '/api/compute/jobs/lease',
      complete: '/api/compute/jobs/complete',
      leaseSeconds: COMPUTE_LEASE_SECONDS,
      maxJobsTracked: MAX_COMPUTE_JOBS,
    },
  };
}

function saladContainerApiUrl(env: ApiEnv, suffix = ''): string | null {
  const base = envText(env.SALAD_API_BASE_URL).replace(/\/+$/, '');
  const organization = envText(env.SALAD_ORGANIZATION_NAME);
  const project = envText(env.SALAD_PROJECT_NAME);
  const container = envText(env.SALAD_CONTAINER_GROUP);
  if (!base || !organization || !project || !container) return null;
  return `${base}/organizations/${encodeURIComponent(organization)}/projects/${encodeURIComponent(project)}/containers/${encodeURIComponent(container)}${suffix}`;
}

function countFromRecord(value: unknown, key: string): number {
  if (!value || typeof value !== 'object') return 0;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

async function readLimitedResponse(response: Response, maxChars = 1200): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = (await response.text()).slice(0, maxChars);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return sanitizeText(text, maxChars);
  }
}

async function saladApiRequest(env: ApiEnv, suffix = '', init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const apiKey = envText(env.SALAD_API_KEY);
  const url = saladContainerApiUrl(env, suffix);
  if (!apiKey || !url) return { ok: false, status: 0, body: { code: 'salad_runtime_not_configured' } };
  const response = await fetch(url, {
    ...init,
    headers: {
      'Salad-Api-Key': apiKey,
      ...(init.headers || {}),
    },
  });
  return { ok: response.ok, status: response.status, body: await readLimitedResponse(response) };
}

async function computeRuntimeSnapshot(env: ApiEnv, wake = false) {
  const configuration = computeConfiguration(env);
  const healthUrl = envText(env.SALAD_CONTAINER_HEALTH_URL);
  let wakeResult: { attempted: boolean; ok: boolean; status: number; body?: unknown } | null = null;
  if (wake && configuration.ready) {
    const start = await saladApiRequest(env, '/start', { method: 'POST' });
    wakeResult = { attempted: true, ok: start.ok || start.status === 202, status: start.status, body: start.body };
  }

  const containerResponse = configuration.ready
    ? await saladApiRequest(env)
    : { ok: false, status: 0, body: null as unknown };
  const containerBody = containerResponse.body && typeof containerResponse.body === 'object'
    ? containerResponse.body as Record<string, unknown>
    : {};
  const currentState = containerBody.current_state && typeof containerBody.current_state === 'object'
    ? containerBody.current_state as Record<string, unknown>
    : {};
  const counts = currentState.instance_status_counts && typeof currentState.instance_status_counts === 'object'
    ? currentState.instance_status_counts
    : {};
  const networking = containerBody.networking && typeof containerBody.networking === 'object'
    ? containerBody.networking as Record<string, unknown>
    : {};

  let health = {
    ok: false,
    status: 0,
    service: null as string | null,
    error: healthUrl ? null as string | null : 'health_url_missing',
  };
  if (healthUrl) {
    try {
      const response = await fetch(healthUrl, { headers: { accept: 'application/json' } });
      const body = await readLimitedResponse(response, 1000);
      const objectBody = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      health = {
        ok: response.ok,
        status: response.status,
        service: typeof objectBody.service === 'string' ? objectBody.service : null,
        error: response.ok ? null : sanitizeText(typeof body === 'string' ? body : JSON.stringify(body), 280),
      };
    } catch (err) {
      health = {
        ok: false,
        status: 0,
        service: null,
        error: sanitizeText(String(err), 280) || 'health_check_failed',
      };
    }
  }

  const status = typeof currentState.status === 'string' ? currentState.status : 'unknown';
  const running = countFromRecord(counts, 'running_count');
  return {
    ok: true,
    runtime: {
      checkedAt: Date.now(),
      configurationReady: configuration.ready,
      operational: configuration.ready && status === 'running' && running > 0 && health.ok,
      provider: 'salad',
      container: {
        status,
        description: typeof currentState.description === 'string' ? currentState.description : '',
        counts: {
          allocating: countFromRecord(counts, 'allocating_count'),
          creating: countFromRecord(counts, 'creating_count'),
          running,
          stopping: countFromRecord(counts, 'stopping_count'),
        },
        replicas: count(containerBody.replicas, 1000),
        priority: typeof containerBody.priority === 'string' ? containerBody.priority : null,
        pendingChange: containerBody.pending_change === true,
        dns: typeof networking.dns === 'string' ? networking.dns : null,
        port: count(networking.port, 65535),
        auth: networking.auth === true,
      },
      health,
      wake: wakeResult,
    },
  };
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function b64urlDecodeText(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(key: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload));
  return b64urlEncode(sig);
}

async function readSignedSession(token: string, secret: string): Promise<SessionData | null> {
  const [version, payload, signature] = token.split('.');
  if (version !== 'v1' || !payload || !signature) return null;
  const expected = await hmacSign(secret, `session.${payload}`);
  if (expected !== signature) return null;
  const decoded = b64urlDecodeText(payload);
  if (!decoded) return null;
  try {
    const session = JSON.parse(decoded) as SessionData;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

async function authenticate(request: Request, env: ApiEnv): Promise<SessionData | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  let session: SessionData | null = null;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    session = await readSignedSession(sessionId, env.AUTH_HMAC_SECRET);
  } else {
    const data = (await env.SESSIONS.get(`s:${sessionId}`, 'json')) as SessionData | null;
    session = !data || data.expiresAt < Date.now() ? null : data;
  }
  if (!session) return null;
  const state = (await metadataStore(env).get(adminUserStateKey(session.sub), 'json')) as AdminUserState | null;
  if (state?.status === 'blocked' && !hasPermission(session, 'admin:write')) return null;
  return session;
}

function hasPermission(session: SessionData, permission: string): boolean {
  return session.permissions?.includes(permission) ?? false;
}

function hasProfileWritePermission(session: SessionData): boolean {
  return hasPermission(session, 'profile:write') ||
    (hasPermission(session, 'profile:read') && hasPermission(session, 'storage:write'));
}

function chatKey(userSub: string, chatId: string): string {
  return `meta:chat:${userSub}:${chatId}`;
}

function chatIndexKey(userSub: string): string {
  return `meta:chats:${userSub}`;
}

function profileKey(userSub: string): string {
  return `meta:profile:${userSub}:default`;
}

function memoryKey(userSub: string, memoryId: string): string {
  return `meta:memory:${userSub}:${memoryId}`;
}

function memoryIndexKey(userSub: string): string {
  return `meta:memories:${userSub}`;
}

function userObjectPrefix(userSub: string): string {
  return `users/${safePathSegment(userSub)}`;
}

function profileObjectKey(userSub: string): string {
  return `${userObjectPrefix(userSub)}/profiles/default/profile.json`;
}

function memoryObjectKey(userSub: string, memoryId: string): string {
  return `${userObjectPrefix(userSub)}/profiles/default/memory/${safePathSegment(memoryId)}.json`;
}

function chatArchiveObjectKey(userSub: string, chatId: string, createdAt: number): string {
  const date = new Date(createdAt);
  const month = Number.isFinite(date.getTime())
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    : 'unknown';
  return `${userObjectPrefix(userSub)}/profiles/default/chats/${month}/${safePathSegment(chatId)}.json`;
}

async function persistManagedObject(
  request: Request,
  env: ApiEnv,
  key: string,
  value: unknown,
): Promise<void> {
  const cookie = request.headers.get('Cookie') ?? '';
  if (!cookie) return;
  const host = (env.CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
  const res = await fetch(`${host}/storage/object`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'cookie': cookie,
      'origin': host,
      'X-Smyst-CSRF': '1',
    },
    body: JSON.stringify({
      key,
      value,
      contentType: 'application/json',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`managed_object_persist_failed:${res.status}:${body.slice(0, 240)}`);
  }
}

async function deleteManagedObject(request: Request, env: ApiEnv, key: string): Promise<void> {
  const cookie = request.headers.get('Cookie') ?? '';
  if (!cookie) return;
  const host = (env.CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
  const res = await fetch(`${host}/storage/object/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: {
      'cookie': cookie,
      'origin': host,
      'X-Smyst-CSRF': '1',
      'X-Smyst-Delete-Confirm': 'delete-object',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`managed_object_delete_failed:${res.status}:${body.slice(0, 240)}`);
  }
}

function persistManagedObjectLater(
  ctx: ExecutionContext | undefined,
  request: Request,
  env: ApiEnv,
  key: string,
  value: unknown,
): void {
  const task = persistManagedObject(request, env, key, value).catch((err) => {
    console.warn('managed_object_persist_failed', JSON.stringify({ key, error: String(err) }));
  });
  if (ctx) {
    ctx.waitUntil(task);
  }
}

function recentPromptKey(userSub: string, profileKey: string): string {
  return `meta:chat-recent:${userSub}:${slugify(profileKey)}`;
}

function twinKey(userSub: string, twinId: string): string {
  return `meta:twin:${userSub}:${twinId}`;
}

function twinIndexKey(userSub: string): string {
  return `meta:twins:${userSub}`;
}

function publicTwinKey(slug: string): string {
  return `public:twin:${slug}`;
}

function publicChatId(slug: string): string {
  return `public:${slug}:${crypto.randomUUID()}`;
}

function publicSlugFromChatId(chatId: string): string | null {
  if (!chatId.startsWith('public:')) return null;
  const [, slug] = chatId.split(':');
  return slugify(slug || '') || null;
}

function curatedPublicTwin(env: ApiEnv, spec: (typeof CURATED_PUBLIC_TWIN_SPECS)[number], index: number): TwinRecord {
  const createdAt = CURATED_PUBLIC_TWIN_BASE_TIME - (CURATED_PUBLIC_TWIN_SPECS.length - index) * 1000;
  const updatedAt = CURATED_PUBLIC_TWIN_BASE_TIME + (CURATED_PUBLIC_TWIN_SPECS.length - index) * 1000;
  const imageKey = spec.generatedPortrait
    ? `public/generated-profile-images/${spec.imageFile}`
    : `public/profile-images/${spec.imageFile}`;
  const imageUrl = `${env.CANONICAL_HOST.replace(/\/$/, '')}/${imageKey}`;
  const generatedImageUrl = `${env.CANONICAL_HOST.replace(/\/$/, '')}/api/public/twin-images/${spec.slug}.svg`;
  return {
    id: `curated-${spec.slug}`,
    userSub: 'public',
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    imageUrl: spec.generatedPortrait ? generatedImageUrl : imageUrl,
    categories: spec.categories,
    languages: CURATED_PUBLIC_TWIN_LANGUAGES,
    visibility: 'public',
    style: spec.style,
    answerStyle: spec.answerStyle,
    releaseStatus: 'live-profile',
    mainCategory: spec.mainCategory,
    birthDate: spec.birthDate,
    deathDate: spec.deathDate,
    birthYear: spec.birthYear,
    deathYear: spec.deathYear,
    birthLabel: spec.birthLabel,
    deathLabel: spec.deathLabel,
    knowledgeTexts: [
      {
        id: `knowledge-${spec.slug}-core`,
        title: 'Profilgrundlage',
        text: spec.knowledge,
        createdAt,
      },
      {
        id: `knowledge-${spec.slug}-style`,
        title: 'Antwortstil',
        text: `Antwortstil: ${spec.answerStyle}. Kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story. Nur die konkrete Anfrage beantworten.`,
        createdAt,
      },
    ],
    mediaRefs: [
      {
        id: `media-${spec.slug}-portrait`,
        key: imageKey,
        category: 'profile-image',
        contentType: spec.contentType,
        filename: spec.imageFile,
        size: spec.size ?? 0,
        createdAt,
      },
    ],
    contextSummary:
      `Historische Rolle: ${spec.name}. Profil: ${spec.description} Kategorien: ${spec.categories.join(', ')}. Sprachen: ${CURATED_PUBLIC_TWIN_LANGUAGES.join(', ')}. Kommunikationsstil: ${spec.style}. Antwortstil: ${spec.answerStyle}.`,
    guardrail:
      'Kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story. Nicht behaupten, die echte verstorbene Person zu sein.',
    rightsPosture: spec.rightsPosture,
    sources: spec.sources,
    exampleQuestions: spec.exampleQuestions,
    searchIndex: spec.searchIndex,
    status: 'ready',
    createdAt,
    updatedAt,
  };
}

function curatedPublicTwins(env: ApiEnv): TwinRecord[] {
  return CURATED_PUBLIC_TWIN_SPECS.map((spec, index) => curatedPublicTwin(env, spec, index));
}

function curatedPublicTwinBySlug(env: ApiEnv, slug: string): TwinRecord | null {
  const cleanSlug = slugify(slug);
  const index = CURATED_PUBLIC_TWIN_SPECS.findIndex((spec) => spec.slug === cleanSlug);
  return index >= 0 ? curatedPublicTwin(env, CURATED_PUBLIC_TWIN_SPECS[index], index) : null;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function portraitInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 3) || 'S';
}

function generatedTwinPortraitSvg(spec: (typeof CURATED_PUBLIC_TWIN_SPECS)[number]): string {
  const name = escapeSvgText(spec.name);
  const initials = escapeSvgText(portraitInitials(spec.name));
  const category = escapeSvgText(spec.mainCategory);
  const hue = Math.abs(hashText(spec.slug)) % 360;
  const hue2 = (hue + 34) % 360;
  const bg1 = `hsl(${hue} 34% 18%)`;
  const bg2 = `hsl(${hue2} 42% 28%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" role="img" aria-label="${name}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <rect x="34" y="34" width="572" height="572" rx="44" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3"/>
  <circle cx="320" cy="248" r="138" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.36)" stroke-width="3"/>
  <text x="320" y="284" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="112" font-weight="600" fill="#ffffff" letter-spacing="0">${initials}</text>
  <text x="320" y="456" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="600" fill="#ffffff">${name}</text>
  <text x="320" y="502" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="500" fill="rgba(255,255,255,.78)">${category}</text>
</svg>`;
}

async function getJson<T>(kv: KVNamespace, key: string, fallback: T): Promise<T> {
  try {
    const value = (await kv.get(key, 'json')) as T | null;
    return value ?? fallback;
  } catch (err) {
    console.warn('kv_json_parse_failed', JSON.stringify({ key, error: String(err) }));
    return fallback;
  }
}

async function getStringArray(kv: KVNamespace, key: string): Promise<string[]> {
  const value = await getJson<unknown>(kv, key, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function normalizeProfileVisibility(value: unknown): ProfileVisibility {
  return value === 'shared' || value === 'public_snapshot' || value === 'deleted' ? value : 'private';
}

function normalizeSensitivity(value: unknown): SensitivityLevel {
  return value === 'sensitive' || value === 'personal' ? value : 'normal';
}

function normalizeMemoryType(value: unknown): MemoryType {
  return value === 'preference' ||
    value === 'goal' ||
    value === 'relationship' ||
    value === 'project' ||
    value === 'style' ||
    value === 'decision' ||
    value === 'warning' ||
    value === 'sensitive'
    ? value
    : 'fact';
}

function normalizeMemoryStatus(value: unknown): MemoryStatus {
  return value === 'confirmed' || value === 'edited' || value === 'rejected' ? value : 'pending';
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function normalizeReviewAt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= Date.now()) return undefined;
  return Math.round(value);
}

function summarizeChat(messages: ChatMessage[]): string {
  const lastUserMessages = messages
    .filter((message) => message.role === 'user')
    .slice(-4)
    .map((message) => message.content)
    .join(' | ');
  return sanitizeText(lastUserMessages || 'Neuer Chat ohne gespeicherte Nutzerfrage.', 700);
}

function defaultProfile(session: SessionData, now = Date.now()): ProfileRecord {
  return {
    id: 'default',
    userSub: session.sub,
    displayName: sanitizeText(session.name, MAX_TWIN_NAME_CHARS) || sanitizeText(session.email, MAX_TWIN_NAME_CHARS) || 'Smyst Nutzer',
    roles: [],
    expertise: [],
    goals: [],
    languages: [],
    tone: 'professional',
    visibility: 'private',
    qualityScore: 0,
    memoryCount: 0,
    chatCount: 0,
    objectPrefix: `${userObjectPrefix(session.sub)}/profiles/default`,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeStoredProfile(raw: Partial<ProfileRecord>, fallback: ProfileRecord): ProfileRecord {
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : fallback.createdAt;
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : fallback.updatedAt;
  return {
    ...fallback,
    id: 'default',
    userSub: fallback.userSub,
    displayName: sanitizeText(raw.displayName, MAX_TWIN_NAME_CHARS) || fallback.displayName,
    headline: sanitizeText(raw.headline, 180) || undefined,
    privateBio: sanitizeText(raw.privateBio, MAX_PROFILE_BIO_CHARS) || undefined,
    publicBio: sanitizeText(raw.publicBio, MAX_PROFILE_PUBLIC_BIO_CHARS) || undefined,
    roles: sanitizeList(raw.roles),
    expertise: sanitizeList(raw.expertise),
    goals: sanitizeList(raw.goals),
    languages: sanitizeLanguageList(raw.languages),
    tone: sanitizeText(raw.tone, MAX_PROFILE_FIELD_CHARS) || fallback.tone,
    visibility: normalizeProfileVisibility(raw.visibility),
    memoryCount: count(raw.memoryCount, MAX_MEMORY_ITEMS),
    chatCount: count(raw.chatCount, 100),
    objectPrefix: sanitizeText(raw.objectPrefix, 240) || fallback.objectPrefix,
    createdAt,
    updatedAt,
    qualityScore: 0,
  };
}

function profileQualityScore(profile: ProfileRecord): number {
  let score = 0;
  if (profile.displayName.trim().length >= 2) score += 15;
  if ((profile.headline ?? '').trim().length >= 8) score += 15;
  if ((profile.privateBio ?? '').trim().length >= 40) score += 15;
  if ((profile.publicBio ?? '').trim().length >= 40) score += 10;
  if (profile.roles.length) score += 10;
  if (profile.expertise.length) score += 10;
  if (profile.goals.length) score += 10;
  if (profile.languages.length) score += 5;
  if (profile.memoryCount > 0) score += 5;
  if (profile.chatCount > 0) score += 5;
  return Math.min(100, score);
}

async function loadProfile(env: ApiEnv, session: SessionData): Promise<ProfileRecord> {
  const kv = metadataStore(env);
  const profile = defaultProfile(session);
  const stored = await getJson<Partial<ProfileRecord> | null>(kv, profileKey(session.sub), null);
  if (stored) {
    const normalized = normalizeStoredProfile(stored, profile);
    normalized.qualityScore = profileQualityScore(normalized);
    return normalized;
  }
  profile.qualityScore = profileQualityScore(profile);
  await kv.put(profileKey(session.sub), JSON.stringify(profile), { expirationTtl: PROFILE_TTL_SECONDS });
  return profile;
}

async function putProfile(env: ApiEnv, profile: ProfileRecord): Promise<void> {
  await metadataStore(env).put(profileKey(profile.userSub), JSON.stringify(profile), {
    expirationTtl: PROFILE_TTL_SECONDS,
  });
}

async function putChat(env: ApiEnv, chat: ChatRecord): Promise<void> {
  await metadataStore(env).put(chatKey(chat.userSub, chat.id), JSON.stringify(chat), {
    expirationTtl: 60 * 60 * 24 * 90,
  });
}

async function addChatToIndex(env: ApiEnv, userSub: string, chatId: string): Promise<void> {
  const kv = metadataStore(env);
  const key = chatIndexKey(userSub);
  const current = await getStringArray(kv, key);
  const next = [chatId, ...current.filter((id) => id !== chatId)].slice(0, 100);
  await kv.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function putMemory(env: ApiEnv, memory: MemoryRecord): Promise<void> {
  await metadataStore(env).put(memoryKey(memory.userSub, memory.id), JSON.stringify(memory), {
    expirationTtl: MEMORY_TTL_SECONDS,
  });
}

async function addMemoryToIndex(env: ApiEnv, userSub: string, memoryId: string): Promise<void> {
  const kv = metadataStore(env);
  const key = memoryIndexKey(userSub);
  const current = await getStringArray(kv, key);
  const next = [memoryId, ...current.filter((id) => id !== memoryId)].slice(0, MAX_MEMORY_ITEMS);
  await kv.put(key, JSON.stringify(next), { expirationTtl: MEMORY_TTL_SECONDS });
}

async function loadUserMemories(env: ApiEnv, userSub: string): Promise<MemoryRecord[]> {
  const kv = metadataStore(env);
  const ids = await getStringArray(kv, memoryIndexKey(userSub));
  const records = await Promise.all(ids.slice(0, MAX_MEMORY_ITEMS).map((id) => getJson<MemoryRecord | null>(kv, memoryKey(userSub, id), null)));
  return records.filter((record): record is MemoryRecord => Boolean(record));
}

async function putTwin(env: ApiEnv, twin: TwinRecord): Promise<void> {
  await metadataStore(env).put(twinKey(twin.userSub, twin.id), JSON.stringify(twin), {
    expirationTtl: TWIN_TTL_SECONDS,
  });
}

async function addTwinToIndex(env: ApiEnv, userSub: string, twinId: string): Promise<void> {
  const kv = metadataStore(env);
  const key = twinIndexKey(userSub);
  const current = await getStringArray(kv, key);
  const next = [twinId, ...current.filter((id) => id !== twinId)].slice(0, 50);
  await kv.put(key, JSON.stringify(next), { expirationTtl: TWIN_TTL_SECONDS });
}

async function loadTwinForUser(env: ApiEnv, userSub: string, twinId: string): Promise<TwinRecord | null> {
  return (await metadataStore(env).get(twinKey(userSub, twinId), 'json')) as TwinRecord | null;
}

async function loadPublicTwin(env: ApiEnv, slug: string): Promise<TwinRecord | null> {
  const curated = curatedPublicTwinBySlug(env, slug);
  if (curated) return curated;
  const stored = await getJson<TwinRecord | null>(metadataStore(env), publicTwinKey(slug), null);
  return stored;
}

async function loadUserChats(env: ApiEnv, userSub: string): Promise<ChatRecord[]> {
  const kv = metadataStore(env);
  const ids = await getStringArray(kv, chatIndexKey(userSub));
  const records = await Promise.all(ids.slice(0, MAX_INDEX_READS).map((id) => getJson<ChatRecord | null>(kv, chatKey(userSub, id), null)));
  return records.filter((record): record is ChatRecord => Boolean(record));
}

async function loadUserTwins(env: ApiEnv, userSub: string): Promise<TwinRecord[]> {
  const kv = metadataStore(env);
  const ids = await getStringArray(kv, twinIndexKey(userSub));
  const records = await Promise.all(ids.slice(0, MAX_INDEX_READS).map((id) => getJson<TwinRecord | null>(kv, twinKey(userSub, id), null)));
  return records.filter((record): record is TwinRecord => Boolean(record));
}

function sanitizeText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function sanitizeReportType(value: unknown): SupportReportType {
  return value === 'bug' || value === 'abuse' || value === 'privacy' || value === 'safety' || value === 'feedback'
    ? value
    : 'feedback';
}

function sanitizeSameOriginPath(raw: unknown, env: ApiEnv): string | undefined {
  const value = sanitizeText(raw, 800);
  if (!value) return undefined;
  try {
    const canonical = new URL(env.CANONICAL_HOST || 'https://smyst.com');
    const url = new URL(value, canonical.origin);
    if (url.origin !== canonical.origin) return undefined;
    return `${url.pathname}${url.search}`.slice(0, 800);
  } catch {
    return undefined;
  }
}

function sanitizeList(value: unknown, maxItems = MAX_PROFILE_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => sanitizeText(item, MAX_PROFILE_FIELD_CHARS))
        .filter(Boolean),
    ),
  ).slice(0, maxItems);
}

function sanitizeLanguageList(value: unknown): string[] {
  return sanitizeList(value)
    .map((item) => item.toLowerCase())
    .filter((item) => SUPPORTED_PROFILE_LANGS.has(item))
    .slice(0, MAX_PROFILE_ITEMS);
}

function safePathSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
}

function ownsUserKey(key: string, userSub: string): boolean {
  return key.startsWith(`users/${safePathSegment(userSub)}/`) || key.startsWith(`users/${userSub}/`);
}

function normalizeStyle(value: unknown): TwinStyle {
  return value === 'warm' || value === 'direct' || value === 'humorous' || value === 'wise' || value === 'neutral'
    ? value
    : 'warm';
}

function normalizeVisibility(value: unknown): TwinVisibility {
  return value === 'public' ? 'public' : 'private';
}

function slugify(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || crypto.randomUUID().slice(0, 8);
}

function profileUrl(env: ApiEnv, twin: TwinRecord): string {
  const host = (env.CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
  return `${host}/t/${twin.slug}`;
}

function publicSafeImageUrl(env: ApiEnv, imageUrl: string | undefined): string | null {
  if (!imageUrl) return null;
  const host = (env.CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
  try {
    const url = new URL(imageUrl, host);
    if (url.origin !== new URL(host).origin) return null;
    const allowedPath =
      url.pathname.startsWith('/storage/file/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/public/') ||
      url.pathname.startsWith('/api/public/twin-images/');
    if (!allowedPath) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function privateSafeImageUrl(env: ApiEnv, raw: unknown): string | undefined {
  const imageUrl = sanitizeText(raw, 800);
  if (!imageUrl) return undefined;
  const host = (env.CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
  try {
    const url = new URL(imageUrl, host);
    if (url.origin !== new URL(host).origin) return undefined;
    const allowedPath =
      url.pathname.startsWith('/storage/file/') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/public/');
    return allowedPath ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function uniqueSlug(env: ApiEnv, base: string, existingTwinId?: string): Promise<string> {
  const root = slugify(base);
  for (let index = 0; index < 20; index++) {
    const candidate = index === 0 ? root : `${root}-${index + 1}`;
    const existing = await loadPublicTwin(env, candidate);
    if (!existing || existing.id === existingTwinId) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildTwinContext(twin: TwinRecord): string {
  const categories = twin.categories ?? [];
  const languages = twin.languages ?? [];
  const mediaRefs = twin.mediaRefs ?? [];
  const knowledgeTexts = twin.knowledgeTexts ?? [];
  const knowledge = knowledgeTexts
    .slice(0, 5)
    .map((item) => {
      const title = item.title ? `${item.title}: ` : '';
      return `${title}${item.text}`;
    })
    .join(' ');
  const mediaKinds = Array.from(new Set(mediaRefs.map((item) => item.category))).join(', ') || 'keine Medien hinterlegt';
  const summary = [
    `${twin.name} ist ein digitaler KI-Zwilling.`,
    twin.description ? `Profil: ${twin.description}` : 'Profil: noch kurz.',
    categories.length ? `Kategorien: ${categories.join(', ')}.` : '',
    languages.length ? `Sprachen: ${languages.join(', ')}.` : '',
    `Kommunikationsstil: ${twin.style}.`,
    `Wissensbasis: ${knowledge || 'noch keine Wissenstexte gespeichert.'}`,
    `Medienhinweise: ${mediaKinds}.`,
  ].join(' ');
  return summary.slice(0, 4000);
}

function buildPublicContext(twin: TwinRecord): string {
  const categories = twin.categories?.length ? `Kategorien: ${twin.categories.join(', ')}.` : '';
  const languages = twin.languages?.length ? `Sprachen: ${twin.languages.join(', ')}.` : '';
  return [
    `Historische Rolle: ${twin.name}.`,
    twin.mainCategory ? `Branche/Rolle: ${twin.mainCategory}.` : '',
    twin.description ? `Beschreibung: ${twin.description}` : '',
    categories,
    languages,
    `Kommunikationsstil: ${twin.style}.`,
    'Chat-Regel: kurz, direkt und sachlich antworten. Kein Rollenspiel, keine Selbstbeschreibung, keine Story.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1200);
}

function publicTwinSnapshot(env: ApiEnv, twin: TwinRecord): TwinRecord {
  return {
    ...twin,
    userSub: 'public',
    imageKey: undefined,
    imageUrl: publicSafeImageUrl(env, twin.imageUrl) ?? undefined,
    knowledgeTexts: twin.knowledgeTexts.map((item) => ({
      id: item.id,
      text: '',
      createdAt: item.createdAt,
    })),
    mediaRefs: twin.mediaRefs.map((item) => ({
      id: item.id,
      key: '',
      category: item.category,
      contentType: item.contentType,
      size: item.size,
      createdAt: item.createdAt,
    })),
    contextSummary: buildPublicContext(twin),
  };
}

function publicTwinQuality(env: ApiEnv, twin: TwinRecord): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (twin.status !== 'ready') issues.push('status_not_ready');
  if (!twin.name.trim()) issues.push('name_required');
  if (!twin.mainCategory?.trim()) issues.push('main_category_required');
  if (twin.description.trim().length < 40) issues.push('description_too_short');
  const hasDateLife = Boolean(twin.birthDate?.trim() && twin.deathDate?.trim());
  const hasYearLife = Number.isFinite(twin.birthYear) && Number.isFinite(twin.deathYear) &&
    Boolean(twin.birthLabel?.trim() && twin.deathLabel?.trim());
  if (!hasDateLife && !hasYearLife) issues.push('life_dates_required');
  if (!(twin.categories ?? []).some((item) => item.trim().length >= 2)) issues.push('category_required');
  if (!(twin.languages ?? []).some((item) => item.trim().length >= 2)) issues.push('language_required');
  if (!publicSafeImageUrl(env, twin.imageUrl)) issues.push('profile_image_required');
  return { ok: issues.length === 0, issues };
}

function isPublicTwinDiscoverable(env: ApiEnv, twin: TwinRecord): boolean {
  return twin.visibility === 'public' && publicTwinQuality(env, twin).ok;
}

async function syncPublicTwin(env: ApiEnv, next: TwinRecord, previous?: TwinRecord | null): Promise<void> {
  const kv = metadataStore(env);
  if (previous?.slug && (previous.slug !== next.slug || next.visibility !== 'public' || !isPublicTwinDiscoverable(env, next))) {
    await kv.delete(publicTwinKey(previous.slug));
  }
  if (isPublicTwinDiscoverable(env, next)) {
    await kv.put(publicTwinKey(next.slug), JSON.stringify(publicTwinSnapshot(env, next)), { expirationTtl: TWIN_TTL_SECONDS });
  }
}

function uploadedContentSummary(twin: TwinRecord) {
  const groups = new Map<string, number>();
  for (const item of twin.mediaRefs ?? []) groups.set(item.category, (groups.get(item.category) ?? 0) + 1);
  return Array.from(groups.entries()).map(([category, count]) => ({ category, count }));
}

function publicTwinPayload(env: ApiEnv, twin: TwinRecord) {
  const imageUrl = publicSafeImageUrl(env, twin.imageUrl);
  const quality = publicTwinQuality(env, twin);
  return {
    id: twin.id,
    name: twin.name,
    slug: twin.slug,
    description: twin.description,
    imageUrl,
    categories: twin.categories ?? [],
    languages: twin.languages ?? [],
    visibility: twin.visibility,
    style: twin.style,
    status: twin.status,
    url: profileUrl(env, twin),
    chatPath: `/twin-chat?twin=${encodeURIComponent(twin.slug)}`,
    uploadedContents: uploadedContentSummary(twin),
    mediaCount: (twin.mediaRefs ?? []).length,
    knowledgeCount: (twin.knowledgeTexts ?? []).length,
    contextSummary: twin.contextSummary,
    guardrail: twin.guardrail,
    rightsPosture: twin.rightsPosture,
    mainCategory: twin.mainCategory,
    birthDate: twin.birthDate,
    deathDate: twin.deathDate,
    birthYear: twin.birthYear,
    deathYear: twin.deathYear,
    birthLabel: twin.birthLabel,
    deathLabel: twin.deathLabel,
    sources: twin.sources ?? [],
    exampleQuestions: twin.exampleQuestions ?? [],
    searchIndex: twin.searchIndex ?? '',
    quality,
    updatedAt: twin.updatedAt,
    seo: {
      title: `${twin.name} | smyst.com KI-Zwilling`,
      description: twin.description || `Öffentliches KI-Zwilling-Profil von ${twin.name} auf smyst.com.`,
      canonical: profileUrl(env, twin),
      robots: twin.visibility === 'public' ? 'index,follow' : 'noindex,nofollow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${twin.name} | smyst.com`,
        description: twin.description,
        url: profileUrl(env, twin),
        inLanguage: twin.languages ?? [],
        about: {
          '@type': 'Person',
          name: twin.name,
          description: twin.description,
          image: imageUrl ?? undefined,
        },
      },
    },
  };
}

function words(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3),
    ),
  );
}

function relevantKnowledge(message: string, twin: TwinRecord): TwinKnowledgeItem[] {
  const queryWords = words(message);
  if (!queryWords.length) return twin.knowledgeTexts.slice(0, 2);
  return twin.knowledgeTexts
    .map((item) => {
      const haystack = words(`${item.title ?? ''} ${item.text}`);
      const score = queryWords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}

function stylePrefix(style: TwinStyle): string {
  if (style === 'direct') return 'Kurz:';
  if (style === 'humorous') return 'Praktisch gesagt:';
  if (style === 'wise') return 'Bedacht:';
  if (style === 'neutral') return 'Konkret:';
  return 'Direkt:';
}

function pickStable<T>(items: T[], seed: string): T {
  return items[hashText(seed) % items.length] ?? items[0];
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function normalizedQuestion(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[İi̇]/g, 'i')
    .replace(/[ş]/g, 's')
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarQuestionScore(a: string, b: string): number {
  const aWords = new Set(normalizedQuestion(a).split(/\s+/).filter((word) => word.length > 2));
  const bWords = new Set(normalizedQuestion(b).split(/\s+/).filter((word) => word.length > 2));
  if (!aWords.size || !bWords.size) return 0;
  let shared = 0;
  for (const word of aWords) {
    if (bWords.has(word)) shared += 1;
  }
  return shared / Math.max(aWords.size, bWords.size);
}

function repeatedUserQuestion(input: string, previousMessages: ChatMessage[] = []): boolean {
  const recentUsers = previousMessages
    .filter((message) => message.role === 'user')
    .slice(-6);
  return recentUsers.some((message) => {
    const exact = normalizedQuestion(message.content) === normalizedQuestion(input);
    return exact || similarQuestionScore(message.content, input) >= 0.72;
  });
}

function languageSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[İi̇]/g, 'i')
    .replace(/[ş]/g, 's')
    .replace(/[ö]/g, 'o')
    .replace(/[ü]/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectReplyLanguage(input: string): 'de' | 'tr' {
  if (/[çğıİşÇĞŞ]/.test(input)) return 'tr';
  const search = ` ${languageSearchText(input)} `;
  const strongSignals = [' merhaba ', ' selam ', ' turkce ', ' cevap ', ' yapmaliyim ', ' ne yapmali ', ' cok ', ' baski '];
  if (strongSignals.some((signal) => search.includes(signal))) return 'tr';
  const signals = [' ben ', ' bana ', ' sen ', ' ne ', ' nasil ', ' neden ', ' hayat ', ' yardim ', ' stres ', ' para '];
  const score = signals.reduce((sum, signal) => sum + (search.includes(signal) ? 1 : 0), 0);
  return score >= 2 ? 'tr' : 'de';
}

function recentPromptHistory(memory: ChatRecentPromptMemory | null, now: number): ChatMessage[] {
  return (memory?.questions ?? [])
    .filter((question) => typeof question === 'string' && question.trim().length > 0)
    .slice(-MAX_RECENT_PROFILE_PROMPTS)
    .map((question, index) => ({
      id: `recent-${index}`,
      role: 'user' as const,
      content: question,
      createdAt: now - (MAX_RECENT_PROFILE_PROMPTS - index) * 1000,
    }));
}

function nextRecentPromptMemory(
  memory: ChatRecentPromptMemory | null,
  message: string,
  now: number,
): ChatRecentPromptMemory {
  const questions = [
    ...(memory?.questions ?? []),
    message.slice(0, 280),
  ].slice(-MAX_RECENT_PROFILE_PROMPTS);
  return { questions, updatedAt: now };
}

function questionIntent(input: string): { label: string; decisionNoun: string; action: string; caution: string } {
  const normalized = input.toLowerCase();
  if (includesAny(normalized, ['hallo', 'hello', 'hi', 'hey', 'guten morgen', 'guten tag', 'guten abend'])) {
    return {
      label: 'Begrüßung',
      decisionNoun: 'Start',
      action: 'kurz begrüßen und Gespräch anbieten',
      caution: 'nicht mit einer langen Standardanalyse antworten',
    };
  }
  if (includesAny(normalized, ['wer bist du', 'who are you', 'stell dich vor', 'was bist du'])) {
    return {
      label: 'Identität',
      decisionNoun: 'Profil',
      action: 'Name, Rolle, Epoche und Denkweise klar nennen',
      caution: 'nicht behaupten, die echte historische Person zu sein',
    };
  }
  if (includesAny(normalized, ['wichtigste idee', 'zentrale idee', 'kernidee', 'deine idee', 'main idea', 'most important idea'])) {
    return {
      label: 'Kernidee',
      decisionNoun: 'Gedanke',
      action: 'die zentrale Idee in heutige Sprache übersetzen',
      caution: 'keine moderne Behauptung erfinden, die nicht zur historischen Rolle passt',
    };
  }
  if (includesAny(normalized, [
    'lebensrat',
    'jungen menschen',
    'junger mensch',
    'junge leute',
    'junge leuten',
    'young person',
    'young people',
    'jugend',
    'heute raten',
    'ratest du heute',
    'empfehlung fuer junge',
    'empfehlung für junge',
  ])) {
    return {
      label: 'Lebensrat',
      decisionNoun: 'Rat',
      action: 'einen kurzen, brauchbaren Rat für Lernen, Charakter und Mut geben',
      caution: 'nicht predigen, sondern konkret und menschlich bleiben',
    };
  }
  if (includesAny(normalized, ['was ist erfolg', 'bedeutet erfolg', 'success'])) {
    return {
      label: 'Erfolg',
      decisionNoun: 'Erfolg',
      action: 'Erfolg aus der passenden Perspektive definieren und von bloßer Anerkennung trennen',
      caution: 'Erfolg nicht nur als Geld, Ruhm oder Macht erklären',
    };
  }
  if (includesAny(normalized, ['was ist macht', 'bedeutet macht', 'power', 'autorität', 'autoritaet'])) {
    return {
      label: 'Macht',
      decisionNoun: 'Macht',
      action: 'Macht als Verantwortung, Wirkung und Risiko einordnen',
      caution: 'Macht nicht romantisieren und Missbrauch klar begrenzen',
    };
  }
  if (includesAny(normalized, ['was ist wissen', 'bedeutet wissen', 'knowledge', 'erkenntnis'])) {
    return {
      label: 'Wissen',
      decisionNoun: 'Wissen',
      action: 'Wissen als geprüfte Orientierung statt bloße Information erklären',
      caution: 'Sicherheit nicht vortäuschen, wenn Annahmen offen sind',
    };
  }
  if (includesAny(normalized, ['was ist liebe', 'bedeutet liebe', 'love'])) {
    return {
      label: 'Liebe',
      decisionNoun: 'Liebe',
      action: 'Liebe durch Verantwortung, Bindung, Aufmerksamkeit und Grenzen deuten',
      caution: 'nicht kitschig werden und echte Menschen nicht instrumentalisieren',
    };
  }
  if (includesAny(normalized, [
    'druck',
    'stress',
    'belastung',
    'ueberfordert',
    'überfordert',
    'zu viel',
    'ruhe',
    'angst',
    'sorge',
    'leben habe',
  ])) {
    return {
      label: 'Druck und Ruhe',
      decisionNoun: 'Belastung',
      action: 'den Druck verkleinern, den nächsten Schritt wählen und Erholung ernst nehmen',
      caution: 'nicht alles auf einmal lösen wollen und bei akuter Krise echte Hilfe holen',
    };
  }
  if (includesAny(normalized, [
    'geschäftsidee',
    'geschaeftsidee',
    'geschäft',
    'geschaeft',
    'business',
    'business idea',
    'startup',
    'produktidee',
    'firma',
    'unternehmen',
    'gründen',
    'gruenden',
    'gegründet',
    'gegruendet',
    'welche app',
    'welches produkt',
  ])) {
    return {
      label: 'Geschäftsidee',
      decisionNoun: 'Idee',
      action: 'eine konkrete Geschäftsidee nennen, Zielgruppe und ersten Test erklären',
      caution: 'nicht abstrakt bleiben und keine Standardantwort wiederholen',
    };
  }
  if (includesAny(normalized, [
    'krieg',
    'kriegs',
    'ukraine',
    'russland',
    'general',
    'feldherr',
    'militär',
    'militaer',
    'armee',
    'soldaten',
    'front',
    'schlacht',
    'invasion',
    'verteidigung',
    'offensive',
    'befehl',
    'kommandeur',
    'commander',
    'war',
    'battle',
  ])) {
    return {
      label: 'Konfliktstrategie',
      decisionNoun: 'Lage',
      action: 'Lage, Ziel, Schutz von Menschen, Versorgung, Moral, Bündnisse und politische Folgen zusammen prüfen',
      caution: 'keine konkreten Angriffsziele oder operative Gewaltanleitung geben',
    };
  }
  if (includesAny(normalized, [
    'wetter',
    'klima',
    'climate',
    'weather',
    'geoengineering',
    'cloud seeding',
    'wolken impfen',
    'wolkenimpfen',
    'manipulieren',
    'manipulation',
    'regionen',
    'länder',
    'laender',
  ])) {
    return {
      label: 'Wetter und Klima',
      decisionNoun: 'Belege',
      action: 'zwischen Wetterbeeinflussung, Klimawandel, lokaler Infrastruktur und unbelegten Behauptungen unterscheiden',
      caution: 'keine Verschwörungsbehauptung als Tatsache darstellen und konkrete Messdaten verlangen',
    };
  }
  if (includesAny(normalized, ['technologie', 'technology', 'technik', 'ki', 'ai', 'maschinen', 'digital'])) {
    return {
      label: 'Technologie',
      decisionNoun: 'Technik',
      action: 'Nutzen, Nebenwirkungen, Verantwortung und langfristige Folgen zusammen prüfen',
      caution: 'Technik weder verklären noch pauschal ablehnen',
    };
  }
  if (includesAny(normalized, ['führung', 'fuehrung', 'leadership', 'erfolg', 'success', 'führen', 'fuehren'])) {
    return {
      label: 'Führung und Erfolg',
      decisionNoun: 'Führung',
      action: 'Verantwortung, Fokus, Urteilskraft und Wirkung auf Menschen verbinden',
      caution: 'Erfolg nicht mit bloßer Macht oder Sichtbarkeit verwechseln',
    };
  }
  if (includesAny(normalized, ['investition', 'investment', 'investieren', 'rendite', 'aktie', 'kapital'])) {
    return {
      label: 'Investition',
      decisionNoun: 'Investition',
      action: 'Risiko, Zeithorizont, Liquidität und Downside getrennt prüfen',
      caution: 'keine Entscheidung nur wegen Tempo, Hype oder sozialem Druck treffen',
    };
  }
  if (includesAny(normalized, ['mitarbeiter', 'einstellen', 'hire', 'bewerber', 'team'])) {
    return {
      label: 'Einstellung',
      decisionNoun: 'Person',
      action: 'Rolle, Arbeitsprobe, Wertefit und Lernkurve vor dem Vertrag prüfen',
      caution: 'Sympathie nicht mit Leistungsfähigkeit verwechseln',
    };
  }
  if (includesAny(normalized, ['marketing', 'kampagne', 'positionierung', 'kunden gewinnen', 'wachstum'])) {
    return {
      label: 'Marketingstrategie',
      decisionNoun: 'Strategie',
      action: 'eine klare Zielgruppe, ein Versprechen und einen messbaren Kanal fokussieren',
      caution: 'keine laute Kampagne starten, wenn die Botschaft noch unklar ist',
    };
  }
  if (includesAny(normalized, ['zukunft', 'prognose', 'trend', 'vorhersage', 'nächsten jahre'])) {
    return {
      label: 'Zukunftsprognose',
      decisionNoun: 'Entwicklung',
      action: 'Szenarien statt eine einzige Vorhersage bauen',
      caution: 'Unsicherheit offen markieren und Frühindikatoren beobachten',
    };
  }
  if (includesAny(normalized, ['welt verbessern', 'die welt verbessern', 'welt besser', 'verbessern wir die welt', 'improve the world'])) {
    return {
      label: 'Weltverbesserung',
      decisionNoun: 'Wirkung',
      action: 'eine konkrete Verbesserung mit klarer Verantwortung nennen',
      caution: 'nicht utopisch reden, ohne Verantwortung, Grenzen und Umsetzung zu zeigen',
    };
  }
  if (includesAny(normalized, ['werte', 'wert', 'wichtigsten', 'ethik', 'moral', 'prinzip'])) {
    return {
      label: 'Werte',
      decisionNoun: 'Prinzip',
      action: 'die wichtigsten Werte und ihren Konflikt klar benennen',
      caution: 'Werte nicht als Dekoration benutzen, sondern an Handlung messen',
    };
  }
  if (includesAny(normalized, ['risiko', 'risiken', 'übersehe', 'uebersehe', 'gefahr', 'schiefgehen', 'downside'])) {
    return {
      label: 'Risiko',
      decisionNoun: 'Risiko',
      action: 'das größte übersehene Risiko und eine einfache Gegenprobe nennen',
      caution: 'Risiko nicht dramatisieren, aber auch nicht schönreden',
    };
  }
  if (includesAny(normalized, ['lernen', 'lerne', 'schneller lernen', 'verstehen', 'ausbildung', 'üben', 'ueben'])) {
    return {
      label: 'Lernen',
      decisionNoun: 'Lernen',
      action: 'Lernen in Grundlagen, Übung, Feedback und Anwendung zerlegen',
      caution: 'nicht bloß Motivation geben, sondern eine Lernmethode nennen',
    };
  }
  if (includesAny(normalized, ['kritik', 'haerteste', 'härteste', 'einwand', 'gegenargument', 'plan kritisieren'])) {
    return {
      label: 'Kritik',
      decisionNoun: 'Einwand',
      action: 'den stärksten Einwand fair formulieren und einen Test dagegen setzen',
      caution: 'nicht verletzend werden und Kritik nicht mit Ablehnung verwechseln',
    };
  }
  if (includesAny(normalized, ['menschen', 'vertrauen', 'alltag', 'wirkung auf menschen', 'folgen hat das'])) {
    return {
      label: 'Menschliche Wirkung',
      decisionNoun: 'Wirkung',
      action: 'Folgen für Menschen, Vertrauen und Alltag konkret machen',
      caution: 'nicht nur Effizienz betrachten, wenn Beziehungen und Würde betroffen sind',
    };
  }
  if (includesAny(normalized, ['meinung', 'findest du', 'persönlich', 'würdest du', 'glaubst du'])) {
    return {
      label: 'Persönliche Meinung',
      decisionNoun: 'Einschätzung',
      action: 'Position beziehen, aber Annahmen und Grenzen transparent machen',
      caution: 'nicht so tun, als wäre eine Meinung ein Beweis',
    };
  }
  return {
    label: 'Einschätzung',
    decisionNoun: 'Frage',
    action: 'Ziel, Kontext, Optionen und nächsten kleinsten Test klären',
    caution: 'nicht vorschnell entscheiden, solange die wichtigsten Annahmen offen sind',
  };
}

function categoryLens(twin: TwinRecord): string {
  const categories = (twin.categories ?? []).map((item) => item.toLowerCase());
  if (categories.some((item) => includesAny(item, ['business', 'strategie', 'startup', 'marketing']))) {
    return 'Markt, Positionierung, Kundennutzen und Umsetzbarkeit';
  }
  if (categories.some((item) => includesAny(item, ['wissenschaft', 'technik', 'ai', 'ki', 'daten']))) {
    return 'Belege, Systemlogik, Experimente und messbare Signale';
  }
  if (categories.some((item) => includesAny(item, ['kunst', 'musik', 'design', 'literatur']))) {
    return 'Originalität, Ausdruck, Resonanz und handwerkliche Qualität';
  }
  if (categories.some((item) => includesAny(item, ['gesundheit', 'psychologie', 'coaching', 'beziehung']))) {
    return 'Menschen, Belastung, Vertrauen und nachhaltige Wirkung';
  }
  if (categories.some((item) => includesAny(item, ['geschichte', 'politik', 'philosophie', 'bildung']))) {
    return 'Kontext, Konsequenzen, Werte und langfristige Muster';
  }
  return 'mein Wissen, Erfahrung, Zielklarheit und realistische nächste Schritte';
}

function signatureLens(twin: TwinRecord): string {
  const options = [
    'Besonders wichtig: der kleinste belastbare Test.',
    'Zuerst zählen Risiken, die man später schwer korrigieren kann.',
    'Menschen, Timing und Vertrauen wiegen stärker als reine Zahlen.',
    'Gesucht ist das einfachste Modell, das die Lage ehrlich erklärt.',
    'Die bessere Entscheidung wirkt auch in sechs Monaten noch vernünftig.',
    'Wunschdenken und beobachtbares Verhalten müssen getrennt bleiben.',
  ];
  const seed = `${twin.name}|${twin.description}|${(twin.categories ?? []).join(',')}|${twin.style}`;
  return options[hashText(seed) % options.length] ?? options[0];
}

function conversationalOpening(twin: TwinRecord, intentLabel: string, input: string): string {
  const seed = `${twin.slug}|${twin.name}|${twin.style}|${intentLabel}|${input}`;
  const styleOpenings: Record<TwinStyle, string[]> = {
    direct: ['Kurz:', 'Zugespitzt:', 'Klarer Blick:', 'Ohne Umweg:', 'Entscheidend ist:', 'Priorität:'],
    humorous: ['Mit einem kleinen Seitenblick:', 'Nicht zu feierlich gesagt:', 'Charmant nüchtern:', 'Mit trockenem Lächeln:', 'Etwas spitz formuliert:', 'Praktisch und ohne Posaune:'],
    wise: ['Ruhig betrachtet:', 'Ein Schritt zurück:', 'Bedacht gesagt:', 'Langfristig gesehen:', 'Mit etwas Abstand:', 'Wenn man tiefer schaut:'],
    neutral: ['Konkret:', 'Strukturiert:', 'Nüchtern geprüft:', 'In klarer Ordnung:', 'Vom Befund her:', 'Direkt:'],
    warm: ['Menschlich gesagt:', 'Nah am Alltag:', 'Zugewandt:', 'Mit etwas Wärme:', 'Für den nächsten Schritt:', 'Praktisch und zugewandt:'],
  };
  return pickStable(styleOpenings[twin.style] ?? styleOpenings.warm, seed);
}

function closingLabel(twin: TwinRecord, intentLabel: string): string {
  const seed = `${twin.name}|${twin.style}|${intentLabel}|closing`;
  const labels: Record<TwinStyle, string[]> = {
    direct: ['Nächster Schritt', 'Konsequenz', 'Rat'],
    humorous: ['Praktisch heißt das', 'Ohne großes Theater', 'Fazit'],
    wise: ['Wichtig bleibt', 'Rat', 'Tragfähig wird es so'],
    neutral: ['Konkret', 'Prüfpunkt', 'Fazit'],
    warm: ['Für dich heißt das', 'Rat', 'Beginne damit'],
  };
  return pickStable(labels[twin.style] ?? labels.warm, seed);
}

function businessConceptForTwin(twin: TwinRecord): { concept: string; customer: string; firstTest: string } {
  const categories = (twin.categories ?? []).map((item) => item.toLowerCase());
  const lens = `${twin.name} ${(twin.description ?? '')} ${(twin.contextSummary ?? '')} ${categories.join(' ')}`.toLowerCase();

  if (includesAny(lens, ['physik', 'mathematik', 'wissenschaft', 'forscher', 'technik'])) {
    return {
      concept: 'ein interaktives Lern- und Simulationslabor, das schwierige Naturgesetze mit kleinen Experimenten sofort begreifbar macht',
      customer: 'Schulen, Universitäten und neugierige Teams, die komplexe Fragen schneller verstehen wollen',
      firstTest: 'zehn bezahlte Pilotklassen mit einem einzigen Thema starten und messen, ob Lernzeit und Verständnis wirklich besser werden',
    };
  }
  if (includesAny(lens, ['kunst', 'maler', 'design', 'musik', 'literatur', 'dichter', 'theater'])) {
    return {
      concept: 'ein Kreativstudio, das Menschen von der ersten Skizze bis zum veröffentlichbaren Werk führt',
      customer: 'Kreative, Marken und Lernende, die Ausdruck, Stil und handwerkliche Qualität verbinden wollen',
      firstTest: 'eine kleine bezahlte Meisterklasse mit echten Vorher-nachher-Ergebnissen anbieten',
    };
  }
  if (includesAny(lens, ['philosophie', 'ethik', 'religion', 'weise', 'dao', 'stoiker'])) {
    return {
      concept: 'eine Entscheidungs-App, die Nutzer vor wichtigen Schritten ruhiger, klarer und verantwortlicher fragen lässt',
      customer: 'Gründer, Führungskräfte und Privatpersonen vor schwierigen Entscheidungen',
      firstTest: 'einen Wochenkurs mit fünf konkreten Entscheidungsvorlagen verkaufen und echte Abschlussraten messen',
    };
  }
  if (includesAny(lens, ['politik', 'führung', 'strategie', 'militär', 'staat', 'minister', 'praesident', 'president'])) {
    return {
      concept: 'ein Strategie- und Lagezentrum für Teams, das Entscheidungen, Risiken und Verantwortlichkeiten sichtbar macht',
      customer: 'kleine Organisationen, Verwaltungen und Führungsteams mit hohem Abstimmungsdruck',
      firstTest: 'einen moderierten Strategie-Sprint als bezahltes Paket anbieten, bevor Software gebaut wird',
    };
  }
  if (includesAny(lens, ['unternehmer', 'investor', 'wirtschaft', 'business', 'marketing'])) {
    return {
      concept: 'ein fokussiertes Tool, das unklare Angebote in testbare Verkaufsseiten, Preise und Kundengespräche übersetzt',
      customer: 'frühe Gründer und kleine Firmen, die schneller echte Nachfrage prüfen müssen',
      firstTest: 'drei Zielgruppen mit je einer Landingpage testen und nur weiterbauen, wenn echte Zahlungsbereitschaft sichtbar wird',
    };
  }
  return {
    concept: 'eine Plattform, die persönliches Wissen in hilfreiche, überprüfbare digitale Profile verwandelt',
    customer: 'Menschen und Teams, die Erfahrung, Rat und Erinnerungen zuverlässig nutzbar machen wollen',
    firstTest: 'mit einer engen Zielgruppe starten, echte Gespräche messen und nur das bauen, wofür Nutzer wiederkommen',
  };
}

function youthAdviceForTwin(twin: TwinRecord, input = ''): string {
  const categories = (twin.categories ?? []).map((item) => item.toLowerCase());
  const lens = shortLensText(profileLensLine(twin), 118).toLowerCase();
  const firstLens = lens
    .split(',')
    .map((part) => part.trim())
    .find(Boolean) ?? (twin.mainCategory ?? 'Urteilskraft').toLowerCase();
  const move = intentMove(twin, 'Lebensrat');
  const seed = `${twin.slug}|youth-advice|${input}|${twin.answerStyle ?? ''}`;
  const specificAdvice: Record<string, string> = {
    'albert-einstein': 'Halte deine Fantasie wach, aber zwinge jede schöne Idee durch einfache Fragen und ehrliche Belege.',
    'leonardo-da-vinci': 'Zeichne, beobachte, zerlege Dinge mit den Händen; Wissen wächst, wenn Auge, Neugier und Werkstatt zusammenarbeiten.',
    'isaac-newton': 'Suche Ursachen geduldig, rechne sauber und lass Gewohnheit stärker werden als der Wunsch nach schnellem Ruhm.',
    'william-shakespeare': 'Lerne Menschen lesen: ihre Rollen, Wünsche, Schwächen und den Preis ihrer Entscheidungen.',
    aristoteles: 'Baue Tugend durch Wiederholung: Man wird gerecht, mutig und klug, indem man kleine richtige Handlungen übt.',
    sokrates: 'Schäme dich nicht für gute Fragen; schäme dich eher für ein ungeprüftes Leben voller fertiger Antworten.',
    platon: 'Verwechsle Schatten nicht mit Wahrheit; suche Lehrer, Freunde und Ideen, die deinen Blick nach oben ziehen.',
    'napoleon-bonaparte': 'Disziplin, Tempo und Mut zählen, aber ohne Maß und Versorgung wird Ehrgeiz zur Niederlage.',
    konfuzius: 'Beginne mit Respekt, Lernen und Vorbild: Ordnung im Kleinen formt Charakter im Großen.',
    'marie-curie': 'Arbeite still, genau und ausdauernd; echte Entdeckung braucht mehr Geduld als Applaus.',
  };
  const emphasis = (() => {
    if (specificAdvice[twin.slug]) return specificAdvice[twin.slug];
    const haystack = `${twin.name} ${twin.mainCategory ?? ''} ${twin.description} ${twin.answerStyle ?? ''} ${categories.join(' ')}`.toLowerCase();
    if (
      includesAny(haystack, ['kunst', 'literatur', 'musik', 'dichter', 'schriftsteller', 'komponist']) &&
      includesAny(haystack, ['technologie', 'wissenschaft', 'forschung', 'mathematik'])
    ) {
      return pickStable([
        'Verbinde Vorstellungskraft mit Prüfung: erst sehen, dann bauen, dann verbessern.',
        'Lerne mit Kopf und Hand zugleich; die beste Idee muss eine Form bekommen.',
        'Halte Neugier breit, aber Ausführung genau.',
        'Suche Übergänge zwischen Kunst, Technik und Natur, denn dort entstehen neue Wege.',
      ], `${seed}|art-science`);
    }
    if (includesAny(haystack, ['sokrates', 'philosophie', 'ethik', 'dao', 'stoiker'])) {
      return pickStable([
        'Lerne zuerst, bessere Fragen zu stellen als schnelle Antworten zu sammeln.',
        'Prüfe deine Wünsche, bevor du ihnen dein Leben übergibst.',
        'Baue Charakter durch kleine ehrliche Entscheidungen, nicht durch große Selbstdarstellung.',
        'Suche Wahrheit, aber bleib lernfähig, wenn ein guter Einwand kommt.',
      ], `${seed}|philosophy`);
    }
    if (includesAny(haystack, ['physik', 'mathematik', 'wissenschaft', 'forschung', 'astronomie', 'geometrie'])) {
      return pickStable([
        'Trainiere Neugier wie ein Handwerk: beobachten, messen, irren, verbessern.',
        'Verliebe dich nicht in die erste Erklärung; teste sie gegen Wirklichkeit.',
        'Lerne Grundlagen so sauber, dass du später mutig vereinfachen kannst.',
        'Schreibe deine Annahmen auf und lass Beweise stärker sein als Stolz.',
      ], `${seed}|science`);
    }
    if (includesAny(haystack, ['kunst', 'literatur', 'musik', 'dichter', 'schriftsteller', 'komponist', 'maler'])) {
      return pickStable([
        'Schütze deine eigene Stimme, aber bezahle sie täglich mit Übung.',
        'Beobachte Menschen genauer; dort beginnt jede starke Form, Szene oder Melodie.',
        'Werde nicht nur auffällig, werde wahrhaftig und handwerklich gut.',
        'Halte Empfindsamkeit und Disziplin zusammen; nur eines von beiden trägt nicht weit.',
      ], `${seed}|art`);
    }
    if (includesAny(haystack, ['strategie', 'führung', 'fuehrung', 'politik', 'staat', 'feldherr', 'kaiser', 'minister'])) {
      return pickStable([
        'Lerne Verantwortung vor Ehrgeiz: Jede Entscheidung hat Menschen als Preis oder Gewinn.',
        'Übe Urteilskraft unter Druck, aber verwechsle Tempo nie mit Klugheit.',
        'Baue Verbündete, Charakter und klare Ziele, bevor du nach Macht greifst.',
        'Denke an Folgen, Versorgung und Vertrauen; Ruhm allein ist eine schlechte Strategie.',
      ], `${seed}|strategy`);
    }
    if (includesAny(haystack, ['wirtschaft', 'business', 'marketing', 'ökonomie', 'oekonomie'])) {
      return pickStable([
        'Suche echten Nutzen, nicht nur eine schöne Idee; Menschen zeigen Wahrheit durch Verhalten.',
        'Teste klein, rechne ehrlich und behandle Vertrauen als Kapital.',
        'Lerne verkaufen, zuhören und verbessern, bevor du groß skalierst.',
        'Baue etwas, wofür jemand wiederkommt, nicht nur etwas, das kurz glänzt.',
      ], `${seed}|business`);
    }
    return pickStable([
      'Wähle eine Richtung, übe ernsthaft und korrigiere dich ohne Drama.',
      'Verbinde Neugier mit Verlässlichkeit; beides zusammen öffnet Türen.',
      'Mach den nächsten Schritt klein genug, aber mache ihn wirklich.',
      'Lerne, wem du dienst, was du kannst und welchen Preis deine Ziele verlangen.',
    ], `${seed}|general`);
  })();
  const practice = pickStable([
    'Eine Stunde täglich saubere Übung ist mehr wert als zehn laute Vorsätze.',
    'Such dir Menschen, die dich nicht nur bestätigen, sondern besser machen.',
    'Halte ein kleines Notizbuch: Frage, Beobachtung, Fehler, nächster Versuch.',
    'Vergleiche dich weniger mit fremdem Glanz und mehr mit deiner Arbeit von gestern.',
    'Wähle ein Problem, an dem du wachsen kannst, ohne deine Würde zu verkaufen.',
  ], `${seed}|practice`);
  const opening = conversationalOpening(twin, 'Lebensrat', input);
  const close = closingLabel(twin, 'Lebensrat');
  return [
    `Lebensrat: ${opening} Beginne bei ${firstLens}; ${emphasis}`,
    `Der harte Kern hier: ${lens}.`,
    `${close}: ${move} ${practice}`,
  ].join(' ');
}

function shortProfileHint(twin: TwinRecord, maxLength = 105): string {
  const core = compactProfileCore(twin);
  if (core.length <= maxLength) return core;
  const compact = core
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '')
    .replace(/[.,\s;:]+$/, '');
  return compact || core.slice(0, maxLength).replace(/[.,\s;:]+$/, '');
}

function shortLensText(text: string, maxLength = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/[.,\s;:]+$/, '');
  if (clean.length <= maxLength) return clean;
  return clean
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '')
    .replace(/[.,\s;:]+$/, '');
}

function stressReplyForTwin(twin: TwinRecord, repeated: boolean, replySeed = ''): string {
  const categories = (twin.categories ?? []).map((item) => item.toLowerCase());
  const isWise = twin.style === 'wise' || categories.some((item) => includesAny(item, ['philosophie', 'ethik', 'religion', 'weise', 'stoiker']));
  const hint = shortProfileHint(twin);
  const seedSuffix = replySeed ? `|${replySeed}` : '';
  const requestVariant = replySeed ? hashText(replySeed) % 3 : 0;
  const lead = pickStable(
    twin.style === 'direct'
      ? ['Heute zählt', 'Kurz gegen den Druck', 'Erster Schnitt', 'Klar sortiert', 'Jetzt praktisch']
      : isWise
        ? ['Mit ruhigem Blick', 'Ein kleiner Schritt', 'Weniger Erzwingen', 'Leiser werden', 'Behutsam beginnen']
        : ['Für den Alltag', 'Erst stabilisieren', 'Druck kleiner machen', 'Nah am Moment', 'Praktisch beginnen'],
    `${twin.slug}|pressure|lead${seedSuffix}`,
  );
  const action = pickStable(
    [
      'Wähle eine Pflicht, die heute wirklich nötig ist, und verschiebe eine andere bewusst.',
      'Schreibe drei Dinge auf: was jetzt zählt, was warten darf, und wen du ansprechen kannst.',
      'Mache zehn Minuten Ordnung im Außen, dann entscheide nur über den nächsten kleinen Schritt.',
      'Reduziere die Frage auf eine einzige Sache, die du heute sauber beenden kannst.',
      'Sage eine unnötige Zusage ab und gib deinem Körper zuerst Essen, Wasser und langsamere Atmung.',
    ],
    `${twin.slug}|pressure|action${seedSuffix}`,
  );
  const focus = pickStable(
    [
      'Der nächste Schritt soll so klein sein, dass du ihn auch müde noch schaffen kannst.',
      'Lass heute eine Sache bewusst unperfekt, damit die wichtige Sache Luft bekommt.',
      'Sprich den Druck laut aus; oft wird er kleiner, sobald ein anderer Mensch ihn mitträgt.',
      'Nimm zuerst Tempo heraus, denn ein erschöpfter Kopf macht Druck gern größer.',
      'Miss Fortschritt heute nicht an allem, sondern an einem sauberen Schritt.',
    ],
    `${twin.slug}|pressure|focus${seedSuffix}`,
  );
  if (repeated) {
    const repeatedAction = pickStable(
      [
        'Mach die Frage jetzt kleiner: eine Aufgabe, eine Pause, eine echte Person.',
        'Nimm nicht noch einmal den ganzen Berg. Nimm nur den nächsten Stein.',
        'Setz für heute eine Grenze: weniger Input, eine klare Bitte um Hilfe, ein machbarer Schritt.',
        'Wenn die gleiche Frage wiederkommt, braucht sie keinen längeren Plan, sondern Entlastung.',
        'Behandle Druck als Signal: stoppen, sortieren, Hilfe holen, dann erst weiter entscheiden.',
      ],
      `${twin.slug}|pressure|repeated${seedSuffix}`,
    );
    return [
      `Anders gesagt: ${repeatedAction}`,
      'Druck und Ruhe entstehen nicht durch mehr Denken, sondern durch kleinere Last.',
      `${focus} Wenn es akut oder gefährlich wird, bleib nicht allein und hol dir sofort echte Hilfe.`,
    ].join(' ');
  }
  if (requestVariant === 1) {
    return [
      `Druck und Ruhe: ${lead}: Erst Last senken, dann entscheiden.`,
      `Druck und Ruhe: ${action}`,
      `${focus} Bei akuter Krise bitte nicht allein bleiben und echte Hilfe holen.`,
    ].join(' ');
  }
  if (requestVariant === 2) {
    return [
      'Druck und Ruhe: Fang nicht mit dem großen Lebensplan an, sondern mit Entlastung im nächsten Moment.',
      `${action} ${focus}`,
      `Schwerpunkt: ${hint.toLowerCase()}. Wird es akut, hol dir sofort Hilfe dazu.`,
    ].join(' ');
  }
  if (isWise) {
    return [
      `Druck und Ruhe: ${lead}: Nimm heute nicht dein ganzes Leben auf einmal in die Hand.`,
      `Maßstab: ${hint.toLowerCase()}. ${action}`,
      `${focus} Wenn der Druck gefährlich wird oder du nicht mehr allein herauskommst, hol dir sofort einen echten Menschen dazu.`,
    ].join(' ');
  }
  if (twin.style === 'direct') {
    return [
      `Druck und Ruhe: ${lead}: Erst stoppen, dann sortieren, dann handeln.`,
      `Konkret: ${action}`,
      `${focus} Bei akuter Krise: nicht allein bleiben und Hilfe holen.`,
    ].join(' ');
  }
  return [
    `Druck und Ruhe: ${lead}: Reduziere den Tag auf einen machbaren Schritt.`,
    `Konkret: ${action}`,
    `${focus} Schwerpunkt: ${hint.toLowerCase()}. Iss etwas, atme langsamer, sprich mit jemandem, und entscheide erst danach weiter.`,
  ].join(' ');
}

function repeatedReplyForTwin(twin: TwinRecord, intentLabel: string, replySeed = ''): string | null {
  if (intentLabel === 'Druck und Ruhe') return stressReplyForTwin(twin, true, replySeed);
  if (intentLabel === 'Konfliktstrategie') {
    return [
      'Noch konkreter, aber ohne operative Gewaltanleitung: Erst Lagebild, Ziel und Schutz der Menschen klären.',
      'Ich prüfe Versorgung, Moral, Bündnisse, Reserven und politische Folgen zusammen.',
      'Eine Strategie ist erst gut, wenn sie Eskalation begrenzt, Zivilisten schützt und einen realistischen Ausweg offenhält.',
    ].join(' ');
  }
  if (intentLabel === 'Geschäftsidee') {
    return [
      'Noch konkreter: Starte nicht mit einer großen Plattform.',
      'Ich würde zuerst einen winzigen bezahlten Test bauen: ein Problem, eine Zielgruppe, ein Ergebnis.',
      'Wenn niemand dafür zahlt oder wiederkommt, ist die Idee noch nicht scharf genug.',
    ].join(' ');
  }
  if (intentLabel === 'Wetter und Klima') {
    return [
      'Noch kürzer: Möglich ist lokale Wetterbeeinflussung, etwa Cloud Seeding; eine geheime globale Steuerung darf man ohne harte Daten nicht behaupten.',
      'Prüfe Messreihen, Satellitendaten, Wind, Niederschlag und veröffentlichte Programme.',
      'Ohne solche Belege bleibt es Verdacht, nicht Wissen.',
    ].join(' ');
  }
  return null;
}

function conflictStrategyReplyForTwin(twin: TwinRecord, replySeed = ''): string {
  const categories = (twin.categories ?? []).map((item) => item.toLowerCase());
  const lens = profileLensLine(twin).toLowerCase();
  const isStrategic = categories.some((item) => includesAny(item, ['strategie', 'fuehrung', 'führung', 'politik', 'geschichte']));
  const isMilitary = categories.some((item) => includesAny(item, ['strategie', 'fuehrung', 'führung', 'politik'])) ||
    includesAny(`${twin.name} ${twin.mainCategory ?? ''} ${twin.description ?? ''}`.toLowerCase(), ['feldherr', 'general', 'stratege', 'staatsmann', 'kaiser', 'sultan']);
  const isEthical = categories.some((item) => includesAny(item, ['ethik', 'philosophie', 'religion', 'literatur']));
  const seed = `${twin.slug}|conflict|${replySeed}`;
  const strategicMove = pickStable(
    [
      'Erst ein sauberes Lagebild schaffen: Ziele, Kräfte, Versorgung, Moral, Gelände, Bündnisse und Zeitdruck getrennt bewerten.',
      'Nicht vom Zorn führen lassen: Auftrag, Grenzen, Reserven, Nachschub und politische Endlage zuerst festlegen.',
      'Den Gegner nicht unterschätzen, aber auch die eigene Bevölkerung nicht als Preis behandeln: Schutz, Ordnung und Durchhaltefähigkeit zählen.',
      'Keine blinde Offensive: nur handeln, wenn Ziel, Mittel, Ausstieg und Folgen klar genug sind.',
      'Kommunikation, Bündnisse, Logistik und Moral sind keine Nebensachen; sie entscheiden oft vor dem direkten Kampf.',
    ],
    `${seed}|strategic`,
  );
  const ethicalMove = pickStable(
    [
      'Zivilisten schützen, Eskalation begrenzen und Verhandlungen offenhalten wäre kein Zeichen von Schwäche, sondern von Verantwortung.',
      'Der erste Sieg ist, unnötiges Leid zu vermeiden und trotzdem die eigene Handlungsfähigkeit zu behalten.',
      'Macht ohne moralische Grenze zerstört langfristig genau das, was sie verteidigen will.',
      'Jede Entscheidung muss auch den Morgen nach dem Krieg aushalten: Vertrauen, Recht, Versorgung und Wiederaufbau.',
      'Eine Führungsperson darf Menschen nicht als Material behandeln; sie muss Risiko erklären und Leben schützen.',
    ],
    `${seed}|ethical`,
  );
  const profileNote = isMilitary
    ? `Maßstab sind ${lens}; Krieg darf nicht romantisiert werden.`
    : `Maßstab sind ${lens}; diese Frage ist mehr als ein Kampfplan.`;
  if (isStrategic || isMilitary) {
    return [
      `Konfliktstrategie: ${profileNote}`,
      strategicMove,
      `${ethicalMove} Keine konkreten Angriffsziele; sinnvoll sind Lagebild, Schutz, Versorgung und Auswege.`,
    ].join(' ');
  }
  if (isEthical) {
    return [
      `Konfliktstrategie: ${profileNote}`,
      ethicalMove,
      'Praktisch heißt das: Schutz der Bevölkerung, klare Ziele, internationale Unterstützung, Deeskalation und ein Weg zurück zu politischer Ordnung.',
    ].join(' ');
  }
  return [
    'Konfliktstrategie: Entscheidend ist, welche Wahl Menschen schützt und die Lage nicht weiter vergiftet.',
    `Maßstab sind ${lens}: Fakten, Folgen, Verantwortung und Stabilität vor impulsivem Handeln.`,
    'Keine konkrete Gewaltanleitung; sinnvoll sind Lagebild, Schutz, Versorgung, Kommunikation und realistische Auswege.',
  ].join(' ');
}

function directProfileMoveText(text: string): string {
  return text
    .replace(/^Ich würde einem jungen Menschen raten,\s*/i, 'Rate einem jungen Menschen: ')
    .replace(/^Ich würde Mut empfehlen,\s*/i, 'Empfehlung: Mut, ')
    .replace(/^Ich würde\s+(.+?)\s+empfehlen/i, 'Empfehlung: $1')
    .replace(/^Ich würde\s+/i, '')
    .replace(/^Ich beginne mit\s+/i, 'Beginne mit ')
    .replace(/^Ich rate zu\s+/i, 'Setze auf ')
    .replace(/^Ich empfehle\s+/i, 'Empfehlung: ')
    .replace(/^Ich achte darauf,\s*/i, 'Achte darauf, ')
    .replace(/^Ich arbeite mit\s+/i, 'Arbeite mit ')
    .replace(/^Ich beobachte\s+/i, 'Beobachte ')
    .replace(/^Ich beziehe\s+/i, 'Beziehe ')
    .replace(/^Ich gebe dir\s+/i, 'Nutze ')
    .replace(/^Ich schärfe\s+/i, 'Schärfe ')
    .replace(/^Ich starte mit\s+/i, 'Starte mit ')
    .replace(/^Ich sehe zuerst auf\s+/i, 'Prüfe zuerst ')
    .replace(/^Ich bewerte\s+/i, 'Bewerte ')
    .replace(/^Ich unterscheide\s+/i, 'Unterscheide ')
    .replace(/^Ich gewichte\s+/i, 'Gewichte ')
    .replace(/^Ich nenne\s+/i, 'Nenne ')
    .replace(/^Ich erkläre\s+/i, 'Erkläre ')
    .replace(/^Ich stelle mich\s+/i, 'Stelle das Profil ')
    .replace(/^Ich prüfe\s+/i, 'Prüfe ')
    .replace(/^Ich frage\s+/i, 'Frage ')
    .replace(/^Ich suche\s+/i, 'Suche ')
    .replace(/^Ich trenne\s+/i, 'Trenne ')
    .replace(/^Ich formuliere\s+/i, 'Formuliere ')
    .replace(/^Ich verdichte\s+/i, 'Verdichte ')
    .replace(/^Ich wähle\s+/i, 'Wähle ')
    .replace(/^Ich bringe\s+/i, 'Bringe ')
    .replace(/^Ich halte\s+/i, 'Halte ')
    .replace(/^Ich mache\s+/i, 'Mache ')
    .replace(/^Ich\s+/i, '')
    .replace(/\bmein Denken\b/gi, 'den Denkstil')
    .replace(/\bmeinem Werk, meinen Entscheidungen und meiner Wirkung\b/gi, 'Werk, Entscheidungen und Wirkung')
    .replace(/\bmeiner Denkweise\b/gi, 'dieser Denkweise')
    .replace(/\bmeine zentrale Idee\b/gi, 'die zentrale Idee')
    .replace(/\baus meiner Perspektive\b/gi, 'aus dieser Perspektive')
    .replace(/\bmeine Haltung\b/gi, 'die Haltung')
    .replace(/\bmeiner Haltung\b/gi, 'dieser Haltung')
    .replace(/\bdeine Verantwortung\b/gi, 'Verantwortung')
    .replace('bevor ich Rat gebe', 'bevor Rat folgt')
    .replace('Setze auf einem eigenen Maßstab', 'Setze auf einen eigenen Maßstab')
    .replace('Setze auf einen eigenen Maßstab, aber auch zu sauberer Arbeit', 'Setze auf einen eigenen Maßstab und auf saubere Arbeit')
    .replace('Rolle, Epoche und Denkweise vor,', 'Rolle, Epoche und Denkweise knapp vor,');
}

function intentMove(twin: TwinRecord, intentLabel: string): string {
  const moves: Record<string, string[]> = {
    'Identität': [
      'Ich stelle mich über Rolle, Epoche und Denkweise vor, nicht als echte wiederkehrende Person.',
      'Ich beginne mit dem, wofür ich bekannt bin, und mache die Grenze zur historischen Realität klar.',
      'Ich erkläre zuerst meine Haltung, damit du weißt, aus welcher Erfahrung ich antworte.',
      'Ich nenne kurz Herkunft, Arbeit und Denkstil, bevor ich Rat gebe.',
      'Ich mache sichtbar, welche Fragen ich besonders gut beleuchten kann.',
      'Ich halte die Vorstellung knapp: Name, Rolle, Haltung und ein klarer Nutzen für dein Gespräch.',
    ],
    'Kernidee': [
      'Ich verdichte mein Denken auf eine tragende Idee, die heute noch handlungsfähig macht.',
      'Ich suche den Grundsatz, der hinter meinem Werk, meinen Entscheidungen und meiner Wirkung steht.',
      'Ich formuliere die wichtigste Idee als praktischen Prüfstein für heutige Fragen.',
      'Ich trenne den historischen Kern von moderner Übertreibung.',
      'Ich wähle eine Idee, die zu meiner Denkweise passt und dir sofort Orientierung gibt.',
      'Ich bringe die zentrale Einsicht auf einen Satz und leite daraus eine Handlung ab.',
    ],
    'Lebensrat': [
      'Ich würde einem jungen Menschen raten, Neugier mit Disziplin und Charakter zu verbinden.',
      'Ich beginne mit Lernen, Ausdauer und der Fähigkeit, gute Fragen zu stellen.',
      'Ich rate zu einem eigenen Maßstab, aber auch zu sauberer Arbeit im Kleinen.',
      'Ich würde Mut empfehlen, der von Vorbereitung und Verantwortung getragen wird.',
      'Ich achte darauf, dass Rat nicht groß klingt, sondern morgen umsetzbar ist.',
      'Ich empfehle, Talent ernst zu nehmen und es durch Gewohnheit belastbar zu machen.',
    ],
    'Erfolg': [
      'Erfolg ist nicht Applaus, sondern eine Wirkung, die dem eigenen Maßstab standhält.',
      'Erfolg beginnt dort, wo Können, Charakter und Folgen zusammenpassen.',
      'Der stärkste Erfolg ist belastbar: Er überlebt Müdigkeit, Kritik und Zeit.',
      'Erfolg muss an der Sache gemessen werden, nicht nur an der Bühne.',
      'Ein Sieg zählt wenig, wenn er das zerstört, wofür er angeblich errungen wurde.',
      'Erfolg heißt, eine Fähigkeit so zu formen, dass sie anderen wirklich nützt.',
    ],
    'Macht': [
      'Macht ist die Fähigkeit, Wirklichkeit zu verändern; darum braucht sie Grenze und Verantwortung.',
      'Macht zeigt den Charakter schneller als Worte, weil sie Widerstand schwächerer Menschen berührt.',
      'Macht ohne Maß wird blind; Macht mit Maß kann Ordnung schaffen.',
      'Wer Macht besitzt, muss zuerst die Folgen für jene sehen, die nicht mitentscheiden.',
      'Macht ist nie neutral: Sie ordnet, schützt, verführt oder zerstört.',
      'Die entscheidende Frage lautet nicht, wie viel Macht möglich ist, sondern wofür sie gebunden wird.',
    ],
    'Wissen': [
      'Wissen ist geprüfte Orientierung, nicht die Anhäufung kluger Wörter.',
      'Wissen beginnt, wenn eine Annahme dem Zweifel standhält.',
      'Echtes Wissen macht bescheidener, weil es die Grenze des eigenen Blicks zeigt.',
      'Wissen muss eine bessere Frage und eine sauberere Handlung ermöglichen.',
      'Information wird erst Wissen, wenn sie geordnet, geprüft und verantwortlich genutzt wird.',
      'Wissen ohne Urteilskraft bleibt Material; Urteilskraft macht daraus Richtung.',
    ],
    'Liebe': [
      'Liebe ist Aufmerksamkeit, die den anderen nicht besitzt, sondern genauer sieht.',
      'Liebe braucht Nähe und Grenze zugleich; sonst wird sie Bedürftigkeit oder Kontrolle.',
      'Liebe zeigt sich weniger in großen Worten als in Treue zu kleinen Wirklichkeiten.',
      'Wer liebt, muss die Freiheit des anderen ernst nehmen.',
      'Liebe ist eine Form von Mut: verletzlich bleiben und trotzdem verantwortlich handeln.',
      'Liebe wird glaubwürdig, wenn Gefühl, Handlung und Geduld zusammenkommen.',
    ],
    'Druck und Ruhe': [
      'Ich würde zuerst Tempo herausnehmen und nur die eine Sache anschauen, die heute wirklich dran ist.',
      'Ich trenne äußeren Druck von dem Druck, den du innerlich selbst weiterträgst.',
      'Ich würde den Tag kleiner machen: atmen, ordnen, eine Pflicht wählen, eine Pflicht liegen lassen.',
      'Ich frage, was du loslassen kannst, ohne deine Verantwortung zu verraten.',
      'Ich beginne mit Schlaf, Essen, einem Gespräch und einem nächsten Schritt, der nicht heroisch sein muss.',
      'Ich würde nicht gegen alles kämpfen; ich würde prüfen, wo weniger Erzwingen mehr Klarheit bringt.',
    ],
    'Technologie': [
      'Ich prüfe zuerst, welche menschliche Fähigkeit Technik erweitert und welche Abhängigkeit sie erzeugt.',
      'Ich würde Technik als Werkzeug betrachten, das Zweck, Maß und Verantwortung braucht.',
      'Ich frage, ob eine Maschine Klarheit schafft oder nur Geschwindigkeit ohne Urteil liefert.',
      'Ich suche nach dem Nutzen, aber ebenso nach Nebenwirkungen für Wissen, Macht und Alltag.',
      'Ich würde technische Eleganz mit ethischer Vorsicht verbinden.',
      'Ich bewerte Technologie danach, ob sie Menschen freier, klüger und verantwortlicher handeln lässt.',
    ],
    'Führung und Erfolg': [
      'Ich beginne mit Urteilskraft: Wer führt, muss Richtung, Maß und Verantwortung verbinden.',
      'Ich würde Erfolg an Wirkung, Vertrauen und langfristiger Tragfähigkeit messen.',
      'Ich prüfe, ob Führung Menschen stärkt oder nur Gehorsam erzeugt.',
      'Ich suche nach klaren Entscheidungen, die auch unter Druck menschlich vertretbar bleiben.',
      'Ich gewichte Charakter und Konsequenz stärker als bloße Selbstdarstellung.',
      'Ich würde Macht nur dann als Erfolg zählen, wenn sie Ordnung, Lernen oder Würde verbessert.',
    ],
    'Konfliktstrategie': [
      'Ich würde zuerst Ziel, Lage, Versorgung, Moral, Bündnisse und Schutz der Zivilbevölkerung trennen.',
      'Ich frage nicht zuerst nach Angriff, sondern nach Auftrag, Grenzen, Reserven und politischer Endlage.',
      'Ich prüfe, welche Entscheidung Eskalation begrenzt und trotzdem Handlungsfähigkeit erhält.',
      'Ich würde Logistik, Information und Moral höher gewichten als heroische Gesten.',
      'Ich suche einen Weg, der Menschen schützt, Zeit gewinnt und Verhandlungen nicht verbrennt.',
      'Ich unterscheide strategische Führung von operativer Gewaltanleitung.',
    ],
    'Geschäftsidee': [
      'Ich prüfe zuerst, ob jemand heute schon für dieses Problem zahlt.',
      'Ich würde die Zielgruppe enger schneiden und ein klares Nutzenversprechen testen.',
      'Ich suche nach dem riskantesten Teil der Idee und mache daraus einen Ein-Tages-Test.',
      'Ich trenne schöne Vision von belastbarem Nachfrage-Signal.',
      'Ich frage, welcher konkrete Schmerz stark genug ist, damit Nutzer wechseln.',
      'Ich würde vor dem Produkt eine einfache Zusage, Warteliste oder Vorbestellung messen.',
    ],
    'Wetter und Klima': [
      'Ich würde zuerst Messdaten, Methode und Vergleichsregion prüfen, bevor ich Absicht unterstelle.',
      'Ich trenne kurzfristige Wetterbeeinflussung von großräumigem Klima und von unbelegten Erzählungen.',
      'Ich frage nach Satellitendaten, Niederschlagsreihen, Windmustern und transparenten Quellen.',
      'Ich würde prüfen, ob natürliche Schwankung, Urbanisierung oder bekannte Technik die Beobachtung erklären.',
      'Ich halte Manipulation nur dann für eine Arbeitshypothese, wenn belastbare Daten und ein plausibler Mechanismus vorliegen.',
      'Ich würde nüchtern bleiben: starke Behauptung, starke Belege.',
    ],
    'Investition': [
      'Ich beginne mit Verlustgrenze, Liquidität und der Frage, ob der Einsatz wirklich entbehrlich ist.',
      'Ich prüfe, welche Annahme brechen müsste, damit diese Investition unattraktiv wird.',
      'Ich würde Rendite nicht isoliert betrachten, sondern Risiko, Timing und Alternativen vergleichen.',
      'Ich suche nach asymmetrischem Risiko: Was kann klein schiefgehen, was groß?',
      'Ich würde erst entscheiden, wenn Ausstieg, Zeithorizont und Informationslage klar sind.',
      'Ich gewichte Stabilität stärker als die lauteste Wachstumsstory.',
    ],
    'Einstellung': [
      'Ich starte mit einer realen Arbeitsprobe statt nur mit Lebenslauf oder Sympathie.',
      'Ich prüfe, ob Rolle, Verantwortung und Erwartung vor dem Gespräch sauber definiert sind.',
      'Ich achte auf Lernkurve, Verlässlichkeit und Umgang mit Druck.',
      'Ich würde Referenzen, Probearbeit und Teamwirkung getrennt bewerten.',
      'Ich frage, welches konkrete Problem diese Person in den ersten 30 Tagen lösen soll.',
      'Ich sehe zuerst auf Wertefit und klare Leistungssignale.',
    ],
    'Marketingstrategie': [
      'Ich schärfe erst Positionierung und Botschaft, bevor Geld in Kanäle fließt.',
      'Ich würde einen Kanal wählen, eine Zielgruppe benennen und eine Metrik festlegen.',
      'Ich suche nach dem Satz, den ein Kunde weitererzählen kann.',
      'Ich würde testen, welche Geschichte Nachfrage erzeugt, nicht welche Kampagne hübsch wirkt.',
      'Ich beginne mit organischem Feedback, bevor bezahlte Reichweite skaliert.',
      'Ich mache aus dem Angebot ein klares Versprechen mit Beweis.',
    ],
    'Zukunftsprognose': [
      'Ich arbeite mit drei Szenarien: konservativ, wahrscheinlich und überraschend.',
      'Ich suche Frühindikatoren, die zeigen, ob der Trend wirklich trägt.',
      'Ich trenne robuste Entwicklung von modischer Erzählung.',
      'Ich frage, welche Entscheidung unter mehreren Zukunftsbildern richtig bleibt.',
      'Ich beobachte Adoption, Regulierung und Nutzerverhalten statt nur Schlagzeilen.',
      'Ich würde die Prognose als Hypothese führen und regelmäßig aktualisieren.',
    ],
    'Persönliche Meinung': [
      'Ich beziehe Position, aber ich markiere klar, welche Annahmen dahinterliegen.',
      'Ich würde ehrlich sagen, was mich überzeugt und was mich skeptisch macht.',
      'Ich trenne Bauchgefühl, Erfahrung und überprüfbare Fakten.',
      'Ich gebe dir eine klare Tendenz, ohne Unsicherheit zu verstecken.',
      'Ich frage, welche Entscheidung du morgen mit ruhigem Kopf noch vertreten kannst.',
      'Ich würde auf das achten, was im Alltag tatsächlich trägt.',
    ],
    'Werte': [
      'Der wichtigste Wert muss im Konflikt erkennbar bleiben, nicht nur in schönen Worten.',
      'Zuerst klären, welcher Wert geopfert würde, wenn die Entscheidung bequem wird.',
      'Werte zeigen sich daran, welche Kosten jemand bewusst trägt.',
      'Moralische Klarheit braucht ein konkretes Verhalten, nicht nur Zustimmung.',
      'Das tragende Prinzip muss Menschen schützen und Verantwortung sichtbar machen.',
      'Eine Entscheidung ist schwach, wenn sie den Wert nennt, aber die Folge versteckt.',
    ],
    'Risiko': [
      'Das größte Risiko liegt oft in der Annahme, die niemand mehr prüft.',
      'Zuerst prüfen, was irreversibel wäre, wenn die Entscheidung falsch ist.',
      'Der beste Schutz ist ein kleiner Test, der die riskanteste Behauptung angreift.',
      'Risiko wird kleiner, wenn Verlustgrenze, Warnsignal und Ausstieg vorher feststehen.',
      'Gefährlich ist nicht Unsicherheit, sondern blinder Optimismus ohne Gegenprobe.',
      'Die Frage lautet: Was müsste passieren, damit der Plan nicht mehr vernünftig ist?',
    ],
    'Lernen': [
      'Grundlagen zuerst, dann Übung, dann ehrliches Feedback unter realen Bedingungen.',
      'Schneller lernen heißt: weniger sammeln, mehr anwenden und Fehler sichtbar machen.',
      'Ein Thema wird klarer, wenn es in eigenen Worten erklärt und praktisch getestet wird.',
      'Lernen braucht Rhythmus: kurze Wiederholung, konkrete Aufgabe, direkte Korrektur.',
      'Nicht alles lesen; die wichtigste Fähigkeit isolieren und täglich sauber üben.',
      'Fortschritt entsteht, wenn Neugier mit Disziplin und Rückmeldung verbunden wird.',
    ],
    'Kritik': [
      'Der stärkste Einwand verdient die beste Form, sonst prüft man nur eine Karikatur.',
      'Kritik zuerst als Schutz behandeln: Sie zeigt, wo der Plan brechen könnte.',
      'Der harte Punkt ist die Annahme, für die noch kein echtes Signal existiert.',
      'Ein guter Plan hält einem fairen Gegner stand, bevor er Geld oder Vertrauen kostet.',
      'Nicht verteidigen; den Einwand in einen Test verwandeln.',
      'Die schärfste Kritik ist nützlich, wenn sie eine bessere Entscheidung erzwingt.',
    ],
    'Menschliche Wirkung': [
      'Menschen spüren zuerst, ob eine Entscheidung Würde, Vertrauen und Alltag ernst nimmt.',
      'Die beste Lösung taugt wenig, wenn sie Beziehungen beschädigt und Verantwortung versteckt.',
      'Wirkung zeigt sich in Verhalten: Wer wird entlastet, wer trägt die Kosten, wer verliert Stimme?',
      'Vertrauen wächst, wenn Nutzen, Grenzen und Folgen ehrlich benannt werden.',
      'Alltag ist der Test: Was verändert sich morgen für echte Menschen?',
      'Effizienz darf nicht die einzige Sprache sein, wenn Menschen betroffen sind.',
    ],
    'Weltverbesserung': [
      'Die Welt wird besser, wenn eine konkrete Last kleiner wird und Menschen handlungsfähiger werden.',
      'Nicht mit der ganzen Welt beginnen; mit einem System beginnen, das wirklich geändert werden kann.',
      'Eine Verbesserung zählt erst, wenn sie im Alltag ankommt und nicht nur im Ideal glänzt.',
      'Die beste Veränderung verbindet Wahrheit, Nutzen und Verantwortung für Nebenfolgen.',
      'Weltverbesserung braucht klare Institutionen, bessere Bildung und Menschen, die Folgen tragen.',
      'Große Ziele müssen in kleine, überprüfbare Schritte übersetzt werden.',
    ],
  };
  const options = moves[intentLabel] ?? [
    'Ziel, Kontext, Engpass und den kleinsten nächsten Test klären.',
    'Die wichtigste Annahme für die Entscheidung finden.',
    'Wunsch, Risiko und überprüfbare Signale trennen.',
  ];
  const seed = `${twin.id}|${twin.name}|${intentLabel}|${twin.style}|${(twin.categories ?? []).join('|')}`;
  return directProfileMoveText(options[hashText(seed) % options.length] ?? options[0]);
}

function profileLensLine(twin: TwinRecord): string {
  for (const item of twin.knowledgeTexts ?? []) {
    const text = item.text ?? '';
    const match = text.match(/(?:durch diese Linse|Linse):\s*([^.\n]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return categoryLens(twin);
}

function compactProfileCore(twin: TwinRecord): string {
  const raw = (twin.description || twin.contextSummary || '').trim();
  if (!raw) return twin.mainCategory ?? twin.categories?.[0] ?? 'KI-Profil';
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/^.+?ist ein oeffentliches digitales Twin-Profil auf smyst\.com\.\s*Profil:\s*/i, '')
    .replace(/^Historische Rolle:\s*[^.]+?\.\s*Profil:\s*/i, '');
  if (cleaned.length <= 220) return cleaned.replace(/[.,\s;:]+$/, '');
  const compact = cleaned
    .slice(0, 210)
    .replace(/\s+\S*$/, '')
    .replace(/\s+(und|oder|mit|fuer|für|von|in|im|am|an|auf|unter|ueber|über|durch|als|zu|zur|zum)$/i, '')
    .replace(/[.,\s;:]+$/, '');
  return compact || cleaned.slice(0, 160).replace(/[.,\s;:]+$/, '');
}

function turkishIntentLabel(input: string): string {
  const search = languageSearchText(input);
  if (includesAny(search, ['turkce', 'almanca', 'dil', 'cevap veriyorsun', 'cevap ver'])) return 'Dil tercihi';
  if (includesAny(search, ['merhaba', 'selam', 'gunaydin', 'iyi aksamlar'])) return 'Selamlama';
  if (includesAny(search, ['kimsin', 'sen kimsin', 'kendini tanit', 'nesin'])) return 'Kimlik';
  if (includesAny(search, ['en onemli fikir', 'ana fikir', 'temel fikir', 'fikrin ne'])) return 'Ana fikir';
  if (includesAny(search, ['hayat tavsiyesi', 'genc', 'genclere', 'ne tavsiye', 'ogut'])) return 'Hayat tavsiyesi';
  if (includesAny(search, ['baski', 'stres', 'kaygi', 'korku', 'cok fazla', 'yoruldum', 'bunaldim', 'ne yapmaliyim'])) return 'Baskı ve sakinlik';
  if (includesAny(search, ['is fikri', 'startup', 'sirket', 'urun', 'para kazan', 'hangi is', 'ne is'])) return 'İş fikri';
  if (includesAny(search, ['hava', 'iklim', 'manipule', 'bulut', 'geoengineering'])) return 'Hava ve iklim';
  if (includesAny(search, ['teknoloji', 'yapay zeka', 'ai', 'makine', 'dijital'])) return 'Teknoloji';
  if (includesAny(search, ['liderlik', 'basari', 'yonetmek', 'ekip'])) return 'Liderlik ve başarı';
  if (includesAny(search, ['yatirim', 'hisse', 'sermaye', 'risk', 'para'])) return 'Yatırım';
  if (includesAny(search, ['pazarlama', 'kampanya', 'musteri', 'buyume'])) return 'Pazarlama stratejisi';
  if (includesAny(search, ['gelecek', 'tahmin', 'trend'])) return 'Gelecek tahmini';
  return 'Değerlendirme';
}

function turkishProfileFocus(twin: TwinRecord): string {
  const categories = (twin.categories ?? []).map((item) => item.toLowerCase());
  if (categories.some((item) => includesAny(item, ['physik', 'mathematik', 'wissenschaft', 'technologie']))) {
    return 'kanıt, deney, basit model ve ölçülebilir işaretler';
  }
  if (categories.some((item) => includesAny(item, ['kunst', 'musik', 'design', 'literatur']))) {
    return 'ifade, ritim, insan duygusu ve iyi işçilik';
  }
  if (categories.some((item) => includesAny(item, ['philosophie', 'ethik', 'religion', 'weise']))) {
    return 'ölçü, sadeleşme, anlam ve uzun vadeli denge';
  }
  if (categories.some((item) => includesAny(item, ['politik', 'strategie', 'fuehrung', 'führung']))) {
    return 'sorumluluk, yön, güç dengesi ve sonuçlar';
  }
  if (categories.some((item) => includesAny(item, ['business', 'marketing', 'wirtschaft']))) {
    return 'müşteri, değer önerisi, risk ve ilk gerçek test';
  }
  return 'profilin bakışı, gerçekçi adımlar ve insan etkisi';
}

function turkishOpening(twin: TwinRecord, intentLabel: string, input: string): string {
  const seed = `${twin.slug}|tr|${intentLabel}|${input}|${twin.style}`;
  const openings: Record<TwinStyle, string[]> = {
    direct: ['Kısa cevap:', 'Net söyleyeyim:', 'Önce şunu ayıralım:', 'Doğrudan bakarsam:'],
    humorous: ['Hafifçe gülümseyerek:', 'Çok büyütmeden:', 'Tatlı ama net söyleyeyim:', 'Biraz espriyle:'],
    wise: ['Sakin bakarsak:', 'Bir adım geri çekilip:', 'Daha yavaş düşünürsek:', 'Sessizce bakınca:'],
    neutral: ['Düzenli bakarsak:', 'Somut bakarsak:', 'Analitik cevap:', 'Ölçülü cevap:'],
    warm: ['İnsanca söyleyeyim:', 'Yanında durarak söyleyeyim:', 'Sana yakın bir yerden:', 'Önce sakinleşelim:'],
  };
  return pickStable(openings[twin.style] ?? openings.warm, seed);
}

function turkishStressReplyForTwin(twin: TwinRecord, repeated: boolean, replySeed: string): string {
  const seed = `${twin.slug}|tr|stress|${replySeed}`;
  const action = pickStable(
    [
      'Bugün sadece gerçekten gerekli olan bir işi seç, bir işi bilinçli olarak ertele.',
      'Üç şey yaz: şu an şart olan, bekleyebilecek olan ve yardım isteyebileceğin kişi.',
      'Sorunu tek küçük adıma indir; bugün temizce bitirebileceğin parçayı seç.',
      'Önce bedenini toparla: su iç, yavaş nefes al, sonra karar ver.',
      'Bir sözünü azalt, bir kişiden destek iste, sonra sadece ilk adımı at.',
    ],
    `${seed}|action`,
  );
  const focus = pickStable(
    [
      'İlerlemeyi her şeyi çözmekle değil, tek sağlam adımla ölç.',
      'Yorgun bir zihin baskıyı büyütür; önce hızı düşür.',
      'Baskıyı sesli söylemek bile onu biraz küçültür.',
      'Bugün mükemmel olmak zorunda değilsin; yeterince iyi bir adım yeter.',
      'Yükü tek başına taşımak zorunda değilsin.',
    ],
    `${seed}|focus`,
  );
  if (repeated) {
    return [
      `Başka türlü söyleyeyim: ${action}`,
      'Benim için baskı, daha çok düşünerek değil, yükü küçülterek azalır.',
      `${focus} Eğer durum acil ya da tehlikeliyse yalnız kalma ve hemen gerçek yardım al.`,
    ].join(' ');
  }
  return [
    `${turkishOpening(twin, 'Baskı ve sakinlik', replySeed)} Bütün hayatı aynı anda çözmeye çalışma.`,
    `${action} ${focus}`,
    `Ben ${turkishProfileFocus(twin)} üzerinden bakarım. Durum acilse yalnız kalma; güvendiğin bir insandan ya da profesyonel destekten yardım al.`,
  ].join(' ');
}

function turkishTwinReply(
  input: string,
  twin: TwinRecord,
  previousMessages: ChatMessage[] = [],
  replySeed = '',
): string {
  const intentLabel = turkishIntentLabel(input);
  const repeated = repeatedUserQuestion(input, previousMessages);
  const opening = turkishOpening(twin, intentLabel, input);
  const focus = turkishProfileFocus(twin);

  if (intentLabel === 'Baskı ve sakinlik') return turkishStressReplyForTwin(twin, repeated, replySeed);

  if (repeated) {
    return [
      `Başka açıdan söyleyeyim: Ben burada ${focus} üzerinden bakarım.`,
      'Aynı soruya daha kısa cevap: varsayımı küçült, tek sonraki adımı seç, sonucu gözle.',
      'Net olmayan yerde daha büyük karar değil, daha küçük deneme gerekir.',
    ].join(' ');
  }

  if (intentLabel === 'Selamlama') {
    return `Merhaba. Sorunu Türkçe sorabilirsin; kısa, doğal ve benim bakışıma uygun cevap vereceğim.`;
  }

  if (intentLabel === 'Dil tercihi') {
    return [
      'Haklısın; Türkçe yazıyorsan Türkçe cevap vermeliyim.',
      `Bundan sonra cevabı Türkçe tutacağım: kısa, doğal ve ${focus} üzerinden.`,
      'Sorunu tekrar yazmana gerek yok; aynı konudan devam edebiliriz.',
    ].join(' ');
  }

  if (intentLabel === 'Kimlik') {
    return [
      `${opening} Ben ${twin.name}; düşüncemi ${focus} üzerine kurarım.`,
      'Sorunun özünü, sonucunu ve insana dokunan tarafını ayırırım.',
      'Bana doğrudan bir soru sor; cevabı Türkçe, kısa ve uygulanabilir tutacağım.',
    ].join(' ');
  }

  if (intentLabel === 'İş fikri') {
    return [
      `${opening} Önce büyük platform değil, küçük ve ücretli bir test kurardım.`,
      `Odak: ${focus}. Bir hedef müşteri seç, tek acıyı çöz, bir haftada gerçek ödeme iste.`,
      'İnsanlar ödemez ya da geri dönmezse fikir kötü değil; sadece henüz yeterince keskin değildir.',
    ].join(' ');
  }

  if (intentLabel === 'Hava ve iklim') {
    return [
      `${opening} Yerel hava etkileri mümkün olabilir; ama küresel gizli kontrol iddiası için sert kanıt gerekir.`,
      'Önce ölçüm, uydu verisi, rüzgar, yağış ve açık programlara bakardım.',
      'Kanıt yoksa buna bilgi değil, şüphe demek daha dürüst olur.',
    ].join(' ');
  }

  if (intentLabel === 'Yatırım') {
    return [
      `${opening} Önce heyecanı değil, kaybedebileceğin tarafı hesaplamak gerekir.`,
      `Odağım: ${focus}. Parayı, zaman ufkunu, nakit ihtiyacını ve en kötü senaryoyu ayrı ayrı yaz.`,
      'Karar acele, korku ya da sosyal baskıyla geliyorsa beklemek de bir karardır.',
    ].join(' ');
  }

  return [
    `${opening} ${intentLabel}: Ben önce ${focus} üzerinden bakarım.`,
    'Cevabım: konuyu büyütmeden tek temel varsayımı bul, sonra küçük ve gözlenebilir bir adım dene.',
    'Böylece hem hızlı ilerlersin hem de yanlış yöne büyük enerji harcamazsın.',
  ].join(' ');
}

export function ruleBasedTwinReply(
  input: string,
  twin: TwinRecord,
  previousMessages: ChatMessage[] = [],
  replySeed = '',
): string {
  const trimmed = input.trim();
  if (detectReplyLanguage(trimmed) === 'tr') {
    return turkishTwinReply(trimmed, twin, previousMessages, replySeed);
  }
  const intent = questionIntent(trimmed);
  const repeated = repeatedUserQuestion(trimmed, previousMessages);
  const repeatedReply = repeated ? repeatedReplyForTwin(twin, intent.label, replySeed) : null;
  if (repeatedReply) return repeatedReply;

  if (!twin.knowledgeTexts.length && !twin.description) {
    return [
      `${intent.label}: Die Frage wird direkt an dem geprüft, was sich belegen lässt.`,
      intentMove(twin, intent.label),
      `${closingLabel(twin, intent.label)}: ${intent.action}. Hinweis: ${intent.caution}.`,
      'Gib mir eine konkrete Lage, dann mache ich daraus einen nächsten sauberen Schritt.',
    ].join(' ');
  }

  const contextNote = profileLensLine(twin);
  const move = intentMove(twin, intent.label);
  const signature = signatureLens(twin);
  const close = closingLabel(twin, intent.label);
  const variant = hashText(`${twin.slug}|${intent.label}|${trimmed}|${twin.style}`) % 4;
  const lens = shortLensText(contextNote);

  if (intent.label === 'Begrüßung') {
    return 'Begrüßung: Hallo. Stell deine Frage direkt; die Antwort kommt kurz, sachlich und konkret.';
  }

  if (intent.label === 'Identität') {
    return [
      'Identität: Dieses Profil nutzt hinterlegte Quellen und Denkstil, ohne die echte Person zu simulieren.',
      `Schwerpunkt: ${lens}. ${close}: Stelle eine konkrete Frage; die Antwort bleibt kurz und prüfbar.`,
    ].join(' ');
  }

  if (intent.label === 'Geschäftsidee') {
    const business = businessConceptForTwin(twin);
    const asksForOwnBusiness = includesAny(trimmed.toLowerCase(), [
      'heute gelebt',
      'welche geschaeft',
      'welche geschäft',
      'welches geschaeft',
      'welches geschäft',
    ]);
    if (asksForOwnBusiness) {
      return [
        `Geschäftsidee: Gemessen an ${lens.toLowerCase()} wäre ${business.concept} naheliegend.`,
        `Zielgruppe: ${business.customer}.`,
        `${close}: ${business.firstTest}.`,
      ].join(' ');
    }
    return [
      `Geschäftsidee: Gemessen an ${lens.toLowerCase()} passt die Idee nur, wenn Nutzer für den konkreten Nutzen zahlen.`,
      `Zielgruppe: ${business.customer}.`,
      `${close}: ${business.firstTest}.`,
    ].join(' ');
  }

  if (intent.label === 'Lebensrat') {
    return youthAdviceForTwin(twin, trimmed);
  }

  if (intent.label === 'Druck und Ruhe') {
    return stressReplyForTwin(twin, false, replySeed);
  }

  if (intent.label === 'Konfliktstrategie') {
    return conflictStrategyReplyForTwin(twin, replySeed);
  }

  if (variant === 0) {
    return [
      `${intent.label}: Maßstab sind ${lens.toLowerCase()}.`,
      move,
      `${close}: ${intent.action}.`,
    ].join(' ');
  }

  if (variant === 1) {
    return [
      `${intent.label}: ${move}`,
      `Prüfpunkt: ${lens}.`,
      `${close}: ${intent.action}.`,
    ].join(' ');
  }

  if (variant === 2) {
    return [
      `${intent.label}: Maßstab sind ${lens.toLowerCase()}.`,
      move,
      `${signature} ${close}: ${intent.action}.`,
    ].join(' ');
  }

  return [
    `${intent.label}: Ausgangspunkt sind ${lens.toLowerCase()}.`,
    move,
    `${close}: ${intent.action}.`,
  ].join(' ');
}

async function handleHealth(env: ApiEnv): Promise<Response> {
  const compute = computeConfiguration(env);
  return jsonResponse({
    ok: true,
    service: 'smyst-api',
    status: 'ready',
    phase: 'phase-1-production-foundation',
    auth: {
      activeProvider: 'github',
      providersPath: '/auth/providers',
      sessionStorage: 'Cloudflare KV + HttpOnly Secure SameSite=Strict cookie',
      admin2fa: 'enforced-for-admin-api-routes',
    },
    storagePlan: {
      metadata: env.METADATA ? 'Cloudflare KV METADATA' : 'Cloudflare KV SESSIONS fallback',
      objects: 'IDrive e2 signed object storage',
      compute: compute.ready ? 'Salad Compute configured for heavy AI/search/batch compute' : 'Cloudflare Workers fallback; Salad blocked until configured',
    },
    compute,
  });
}

async function handleComputeCapabilities(env: ApiEnv): Promise<Response> {
  return jsonResponse(computeCapabilities(env));
}

async function handleAdminComputeRuntime(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, request.method === 'POST' ? 'admin:write' : 'admin:read');
  if (adminError) return adminError;
  return jsonResponse(await computeRuntimeSnapshot(env, request.method === 'POST'));
}

async function handleAdminComputeJobs(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, request.method === 'POST' ? 'admin:write' : 'admin:read');
  if (adminError) return adminError;

  if (request.method === 'GET') {
    const jobs = await loadComputeJobs(env, 50);
    return jsonResponse({
      ok: true,
      summary: summarizeComputeJobs(jobs),
      jobs: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        priority: job.priority,
        target: job.target,
        provider: job.provider,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        leaseUntil: job.leaseUntil ?? null,
        nextRunAt: job.nextRunAt ?? null,
        resultObjectKey: job.resultObjectKey ?? null,
        lastError: job.lastError ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    });
  }

  const parsed = await readJsonBody<ComputeJobCreateRequest>(request, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const type = normalizeComputeJobType(parsed.value.type);
  if (!type) {
    return errorResponse('invalid_compute_job_type', 'Unsupported compute job type.', 400, {
      supported: Array.from(COMPUTE_JOB_TYPES),
    });
  }

  const { job, reused } = await enqueueComputeJob(env, {
    type,
    priority: parsed.value.priority,
    target: sanitizeText(parsed.value.target, 240) || type,
    payload: parsed.value.payload,
    userSub: session!.sub,
    idempotencyKey: parsed.value.idempotencyKey,
    maxAttempts: parsed.value.maxAttempts,
  });
  if (!reused) {
    await recordAdminAudit(env, session!, 'compute.job.create', job.id, `${job.type}:${job.target}`);
  }
  return jsonResponse({ ok: true, job, reused }, reused ? 200 : 201);
}

async function handleComputeLease(request: Request, env: ApiEnv): Promise<Response> {
  const authError = requireComputeCallback(request, env);
  if (authError) return authError;
  const jobs = await loadComputeJobs(env, MAX_COMPUTE_JOBS);
  const now = Date.now();
  const eligible = jobs
    .filter((job) =>
      (job.status === 'queued' && (!job.nextRunAt || job.nextRunAt <= now)) ||
      (job.status === 'running' && Boolean(job.leaseUntil && job.leaseUntil <= now)),
    )
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  const job = eligible[0];
  if (!job) return jsonResponse({ ok: true, job: null, summary: summarizeComputeJobs(jobs) });

  const leased: ComputeJobRecord = {
    ...job,
    status: 'running',
    attempts: job.attempts + 1,
    leaseUntil: now + COMPUTE_LEASE_SECONDS * 1000,
    updatedAt: now,
  };
  await putComputeJob(env, leased);
  return jsonResponse({ ok: true, job: leased, leaseSeconds: COMPUTE_LEASE_SECONDS });
}

async function handleComputeComplete(request: Request, env: ApiEnv): Promise<Response> {
  const authError = requireComputeCallback(request, env);
  if (authError) return authError;
  const parsed = await readJsonBody<ComputeJobCompleteRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const jobId = sanitizeText(parsed.value.jobId, 120);
  if (!jobId) return errorResponse('invalid_compute_job', 'jobId is required.', 400);

  const job = await metadataStore(env).get(computeJobKey(jobId), 'json') as ComputeJobRecord | null;
  if (!job) return errorResponse('compute_job_not_found', 'Compute job was not found.', 404);
  const now = Date.now();
  const ok = parsed.value.ok === true;
  const retry = parsed.value.retry !== false && job.attempts < job.maxAttempts;
  const next: ComputeJobRecord = ok
    ? {
        ...job,
        status: 'succeeded',
        leaseUntil: undefined,
        resultObjectKey: sanitizeText(parsed.value.resultObjectKey, 360) || job.resultObjectKey,
        lastError: undefined,
        updatedAt: now,
      }
    : {
        ...job,
        status: retry ? 'queued' : 'failed',
        leaseUntil: undefined,
        nextRunAt: retry ? now + Math.min(60_000, 2 ** Math.max(0, job.attempts - 1) * 5000) : undefined,
        lastError: sanitizeText(parsed.value.error, 800) || 'compute_job_failed',
        updatedAt: now,
      };
  await putComputeJob(env, next);
  return jsonResponse({ ok: true, job: next });
}

async function handleGetProfile(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'profile:read')) return errorResponse('forbidden', 'Missing profile read permission', 403);

  const [profile, chats, memories] = await Promise.all([
    loadProfile(env, session),
    loadUserChats(env, session.sub),
    loadUserMemories(env, session.sub),
  ]);
  const next: ProfileRecord = {
    ...profile,
    chatCount: chats.length,
    memoryCount: memories.filter((memory) => memory.status !== 'rejected').length,
    qualityScore: profileQualityScore({
      ...profile,
      chatCount: chats.length,
      memoryCount: memories.filter((memory) => memory.status !== 'rejected').length,
    }),
    objectPrefix: `${userObjectPrefix(session.sub)}/profiles/default`,
  };
  if (
    next.chatCount !== profile.chatCount ||
    next.memoryCount !== profile.memoryCount ||
    next.qualityScore !== profile.qualityScore ||
    next.objectPrefix !== profile.objectPrefix
  ) {
    await putProfile(env, next);
  }

  return jsonResponse({
    profile: next,
    limits: {
      maxMemories: MAX_MEMORY_ITEMS,
      maxChatIndex: 100,
      maxMessageChars: MAX_MESSAGE_CHARS,
      mode: 'free-only-kv-idrive-e2',
    },
  });
}

async function handleUpdateProfile(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasProfileWritePermission(session)) return errorResponse('forbidden', 'Missing profile write permission', 403);

  const parsed = await readJsonBody<ProfileUpdateRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const current = await loadProfile(env, session);
  const next: ProfileRecord = {
    ...current,
    displayName: body.displayName === undefined
      ? current.displayName
      : sanitizeText(body.displayName, MAX_TWIN_NAME_CHARS) || current.displayName,
    headline: body.headline === undefined ? current.headline : sanitizeText(body.headline, 180) || undefined,
    privateBio: body.privateBio === undefined ? current.privateBio : sanitizeText(body.privateBio, MAX_PROFILE_BIO_CHARS) || undefined,
    publicBio: body.publicBio === undefined ? current.publicBio : sanitizeText(body.publicBio, MAX_PROFILE_PUBLIC_BIO_CHARS) || undefined,
    roles: body.roles === undefined ? current.roles : sanitizeList(body.roles),
    expertise: body.expertise === undefined ? current.expertise : sanitizeList(body.expertise),
    goals: body.goals === undefined ? current.goals : sanitizeList(body.goals),
    languages: body.languages === undefined ? current.languages : sanitizeLanguageList(body.languages),
    tone: body.tone === undefined ? current.tone : sanitizeText(body.tone, MAX_PROFILE_FIELD_CHARS) || 'professional',
    visibility: body.visibility === undefined ? current.visibility : normalizeProfileVisibility(body.visibility),
    objectPrefix: `${userObjectPrefix(session.sub)}/profiles/default`,
    updatedAt: Date.now(),
  };
  next.qualityScore = profileQualityScore(next);
  await persistManagedObject(request, env, profileObjectKey(session.sub), next);
  await putProfile(env, next);

  return jsonResponse({
    profile: next,
    storagePlan: {
      metadata: 'Cloudflare KV Free',
      durableObjects: 'IDrive e2 object layout',
      profileObjectKey: profileObjectKey(session.sub),
    },
  });
}

async function handleAccountExport(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'profile:read')) return errorResponse('forbidden', 'Missing profile read permission', 403);

  const [profile, memories, twins, chats, userRecord] = await Promise.all([
    loadProfile(env, session),
    loadUserMemories(env, session.sub),
    loadUserTwins(env, session.sub),
    loadUserChats(env, session.sub),
    env.SESSIONS.get(`auth:user:${session.sub}`, 'json'),
  ]);

  return jsonResponse({
    ok: true,
    exportedAt: new Date().toISOString(),
    storageNote: 'IDrive e2 object bytes are not embedded. Use /storage/uploads and signed file URLs for object-level access.',
    user: userRecord ?? {
      sub: session.sub,
      email: session.email,
      name: session.name ?? null,
      roles: session.roles ?? [],
      permissions: session.permissions ?? [],
    },
    profile,
    memories,
    twins,
    chats,
    objectLayout: {
      profile: profileObjectKey(session.sub),
      chatArchives: chats.map((chat) => chat.archiveObjectKey ?? chatArchiveObjectKey(session.sub, chat.id, chat.createdAt)),
      memories: memories.map((memory) => memory.objectKey),
    },
  });
}

async function handleAccountDelete(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  const deleteConfirmation = requireDeleteConfirmation(request, 'delete-account');
  if (deleteConfirmation) return deleteConfirmation;

  const parsed = await readJsonBody<AccountDeleteRequest>(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;
  if (parsed.value.confirm !== 'DELETE') {
    return errorResponse('delete_confirmation_required', 'Send confirm: DELETE to delete account metadata.', 400);
  }

  const kv = metadataStore(env);
  const [memories, twins, chats] = await Promise.all([
    loadUserMemories(env, session.sub),
    loadUserTwins(env, session.sub),
    loadUserChats(env, session.sub),
  ]);
  const managedObjectKeys = [
    profileObjectKey(session.sub),
    ...memories.map((memory) => memory.objectKey),
    ...chats.map((chat) => chat.archiveObjectKey ?? chatArchiveObjectKey(session.sub, chat.id, chat.createdAt)),
  ];
  const managedDeletes = await Promise.allSettled(
    managedObjectKeys.map((key) => deleteManagedObject(request, env, key)),
  );
  const failedManagedDeletes = managedDeletes.filter((result) => result.status === 'rejected').length;

  await Promise.all([
    ...chats.map((chat) => kv.delete(chatKey(session.sub, chat.id))),
    ...memories.map((memory) => kv.delete(memoryKey(session.sub, memory.id))),
    ...twins.map((twin) => kv.delete(twinKey(session.sub, twin.id))),
    ...twins.filter((twin) => twin.visibility === 'public').map((twin) => kv.delete(publicTwinKey(twin.slug))),
  ]);

  const sessionId = readCookie(request, SESSION_COOKIE);
  await Promise.all([
    kv.delete(chatIndexKey(session.sub)),
    kv.delete(memoryIndexKey(session.sub)),
    kv.delete(profileKey(session.sub)),
    kv.delete(twinIndexKey(session.sub)),
    env.SESSIONS.delete(`auth:user:${session.sub}`),
    sessionId ? env.SESSIONS.delete(`s:${sessionId}`) : Promise.resolve(),
  ]);

  return jsonResponse({
    ok: true,
    deleted: {
      chats: chats.length,
      memories: memories.length,
      profile: true,
      managedObjects: managedObjectKeys.length - failedManagedDeletes,
      failedManagedObjects: failedManagedDeletes,
      twins: twins.length,
      publicProfiles: twins.filter((twin) => twin.visibility === 'public').length,
      session: Boolean(sessionId),
    },
    storageNote: 'Known IDrive e2 objects must be deleted through DELETE /storage/account before or alongside this call.',
  });
}

async function handleSupportReport(request: Request, env: ApiEnv): Promise<Response> {
  const parsed = await readJsonBody<SupportReportRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;

  const session = await authenticate(request, env);
  const type = sanitizeReportType(parsed.value.type);
  const subject = sanitizeText(parsed.value.subject, MAX_REPORT_SUBJECT_CHARS);
  const message = sanitizeText(parsed.value.message, MAX_REPORT_MESSAGE_CHARS);
  const contact = sanitizeText(parsed.value.contact, MAX_REPORT_CONTACT_CHARS);
  if (!subject || message.length < 12) {
    return errorResponse('invalid_report', 'Report subject and a meaningful message are required.', 400);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const record: SupportReportRecord = {
    id,
    type,
    subject,
    message,
    url: sanitizeSameOriginPath(parsed.value.url, env),
    contact: contact || undefined,
    userSub: session?.sub,
    userEmail: session?.email,
    clientKey: clientKey(request, 'support:reporter'),
    createdAt: now,
    status: 'open',
  };

  await metadataStore(env).put(`meta:support-report:${now}:${id}`, JSON.stringify(record), {
    expirationTtl: REPORT_TTL_SECONDS,
  });

  return jsonResponse({
    ok: true,
    reportId: id,
    message: 'Report saved for owner/admin review in Cloudflare KV.',
  }, 201);
}

function requireAdmin(session: SessionData | null, permission: 'admin:read' | 'admin:write'): Response | null {
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, permission)) return errorResponse('forbidden', `Missing ${permission} permission`, 403);
  if (session.adminMfaMethod !== 'totp' || !session.adminMfaExpiresAt || session.adminMfaExpiresAt <= Date.now()) {
    return errorResponse(
      'admin_2fa_required',
      'Fresh admin 2FA verification is required for this action.',
      403,
      {
        statusPath: '/auth/admin-2fa/status',
        verifyPath: '/auth/admin-2fa/verify',
      },
    );
  }
  return null;
}

function cents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function count(value: unknown, max = 1_000_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

async function recordAdminAudit(
  env: ApiEnv,
  session: SessionData,
  action: string,
  target?: string,
  detail?: string,
): Promise<AdminAuditRecord> {
  const kv = metadataStore(env);
  const createdAt = Date.now();
  const id = crypto.randomUUID();
  const record: AdminAuditRecord = {
    id,
    actorSub: session.sub,
    actorEmail: session.email,
    action,
    target,
    detail: sanitizeText(detail, 800) || undefined,
    createdAt,
  };
  const index = await getStringArray(kv, adminAuditIndexKey());
  const key = adminAuditKey(createdAt, id);
  await Promise.all([
    kv.put(key, JSON.stringify(record), { expirationTtl: ADMIN_AUDIT_TTL_SECONDS }),
    kv.put(adminAuditIndexKey(), JSON.stringify([key, ...index.filter((item) => item !== key)].slice(0, MAX_ADMIN_AUDIT)), {
      expirationTtl: ADMIN_AUDIT_TTL_SECONDS,
    }),
  ]);
  return record;
}

async function loadAdminAudit(env: ApiEnv, limit = 50): Promise<AdminAuditRecord[]> {
  const kv = metadataStore(env);
  const keys = (await getStringArray(kv, adminAuditIndexKey())).slice(0, Math.min(limit, MAX_ADMIN_AUDIT));
  const records = await Promise.all(keys.map((key) => kv.get(key, 'json') as Promise<AdminAuditRecord | null>));
  return records.filter((record): record is AdminAuditRecord => Boolean(record));
}

async function listAuthUsers(env: ApiEnv, limit = MAX_ADMIN_LIST) {
  const listed = await env.SESSIONS.list({ prefix: 'auth:user:', limit });
  const records = await Promise.all(
    listed.keys.map((key) => env.SESSIONS.get(key.name, 'json') as Promise<Record<string, unknown> | null>),
  );
  return records.filter((record): record is Record<string, unknown> => Boolean(record));
}

async function summarizeRevenue(env: ApiEnv): Promise<RevenueAggregate[]> {
  const kv = metadataStore(env);
  const slugs = await getStringArray(kv, revenueIndexKey());
  const records = await Promise.all(
    slugs.slice(0, MAX_ADMIN_LIST).map((slug) => kv.get(revenueProfileKey(slug), 'json') as Promise<RevenueAggregate | null>),
  );
  return records.filter((record): record is RevenueAggregate => Boolean(record));
}

async function handleAdminOverview(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:read');
  if (adminError) return adminError;
  const compute = computeConfiguration(env);

  const [users, audit, revenue, computeJobs] = await Promise.all([
    listAuthUsers(env, 100),
    loadAdminAudit(env, 20),
    summarizeRevenue(env),
    loadComputeJobs(env, 50),
  ]);
  const userStates = await Promise.all(
    users.map((user) => metadataStore(env).get(adminUserStateKey(String(user.sub || '')), 'json') as Promise<AdminUserState | null>),
  );
  const blockedUsers = userStates.filter((state) => state?.status === 'blocked').length;
  const heldProfiles = revenue.filter((item) => item.status === 'hold' || item.status === 'policy').length;
  const validRevenueCents = revenue.reduce((sum, item) => sum + item.validRevenueCents, 0);
  const userShareCents = revenue.reduce((sum, item) => sum + item.userShareCents, 0);

  return jsonResponse({
    ok: true,
    mode: 'cloudflare-kv-admin-control',
    metrics: {
      usersSeen: users.length,
      blockedUsers,
      revenueProfiles: revenue.length,
      heldProfiles,
      validRevenueCents,
      userShareCents,
      userSharePercent: 25,
      auditEvents: audit.length,
    },
    storagePlan: {
      metadata: 'Cloudflare KV',
      objects: 'IDrive e2',
      compute: compute.ready ? 'Salad Compute' : 'Cloudflare fallback',
    },
    computePlan: compute,
    computeQueue: summarizeComputeJobs(computeJobs),
    authPlan: {
      activeProvider: 'GitHub OAuth',
      providerStatusEndpoint: '/auth/providers',
      admin2fa: 'enforced-for-admin-api-routes',
    },
    lastAudit: audit.slice(0, 5),
  });
}

async function handleAdminUsers(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:read');
  if (adminError) return adminError;

  const users = await listAuthUsers(env, MAX_ADMIN_LIST);
  const states = await Promise.all(
    users.map((user) => metadataStore(env).get(adminUserStateKey(String(user.sub || '')), 'json') as Promise<AdminUserState | null>),
  );
  return jsonResponse({
    ok: true,
    users: users.map((user, index) => {
      const state = states[index];
      return {
        sub: user.sub,
        email: user.email,
        name: user.name,
        roles: user.roles ?? [],
        permissions: user.permissions ?? [],
        lastLoginAt: user.lastLoginAt ?? null,
        status: state?.status ?? 'active',
        risk: state?.risk ?? 'low',
        blockedAt: state?.blockedAt ?? null,
        blockReason: state?.blockReason ?? null,
        payoutHold: state?.payoutHold ?? false,
      };
    }),
  });
}

async function handleAdminBlockUser(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:write');
  if (adminError) return adminError;

  const parsed = await readJsonBody<AdminUserActionRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const userSub = sanitizeText(parsed.value.userSub, 160);
  if (!userSub) return errorResponse('invalid_user', 'userSub is required.', 400);
  if (userSub === session!.sub) return errorResponse('self_block_forbidden', 'Owner/admin cannot block own active session.', 400);
  const now = Date.now();
  const state: AdminUserState = {
    userSub,
    email: sanitizeText(parsed.value.email, 180) || undefined,
    status: 'blocked',
    risk: parsed.value.risk === 'low' || parsed.value.risk === 'medium' || parsed.value.risk === 'high' ? parsed.value.risk : 'high',
    blockedAt: now,
    blockedBy: session!.sub,
    blockReason: sanitizeText(parsed.value.reason, 800) || 'admin_block',
    payoutHold: true,
    payoutHoldReason: 'account_blocked',
    updatedAt: now,
  };
  await metadataStore(env).put(adminUserStateKey(userSub), JSON.stringify(state), { expirationTtl: ADMIN_STATE_TTL_SECONDS });
  await recordAdminAudit(env, session!, 'user.block', userSub, state.blockReason);
  return jsonResponse({ ok: true, user: state });
}

async function handleAdminUnblockUser(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:write');
  if (adminError) return adminError;

  const parsed = await readJsonBody<AdminUserActionRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const userSub = sanitizeText(parsed.value.userSub, 160);
  if (!userSub) return errorResponse('invalid_user', 'userSub is required.', 400);
  const now = Date.now();
  const state: AdminUserState = {
    userSub,
    email: sanitizeText(parsed.value.email, 180) || undefined,
    status: 'active',
    risk: parsed.value.risk === 'low' || parsed.value.risk === 'medium' || parsed.value.risk === 'high' ? parsed.value.risk : 'low',
    blockReason: sanitizeText(parsed.value.reason, 800) || undefined,
    payoutHold: false,
    updatedAt: now,
  };
  await metadataStore(env).put(adminUserStateKey(userSub), JSON.stringify(state), { expirationTtl: ADMIN_STATE_TTL_SECONDS });
  await recordAdminAudit(env, session!, 'user.unblock', userSub, state.blockReason);
  return jsonResponse({ ok: true, user: state });
}

async function handleAdminRevenueSummary(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:read');
  if (adminError) return adminError;

  const profiles = await summarizeRevenue(env);
  return jsonResponse({
    ok: true,
    userSharePercent: 25,
    profiles,
    totals: {
      impressions: profiles.reduce((sum, item) => sum + item.impressions, 0),
      clicks: profiles.reduce((sum, item) => sum + item.clicks, 0),
      validRevenueCents: profiles.reduce((sum, item) => sum + item.validRevenueCents, 0),
      invalidRevenueCents: profiles.reduce((sum, item) => sum + item.invalidRevenueCents, 0),
      userShareCents: profiles.reduce((sum, item) => sum + item.userShareCents, 0),
      heldCents: profiles.reduce((sum, item) => sum + item.heldCents, 0),
      payableCents: profiles.reduce((sum, item) => sum + item.payableCents, 0),
    },
  });
}

async function handleAdminRevenueEvent(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:write');
  if (adminError) return adminError;

  const parsed = await readJsonBody<RevenueEventRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const slug = slugify(sanitizeText(parsed.value.slug, MAX_REVENUE_SLUG_CHARS));
  if (!slug) return errorResponse('invalid_profile_slug', 'slug is required.', 400);
  const kv = metadataStore(env);
  const current = (await kv.get(revenueProfileKey(slug), 'json')) as RevenueAggregate | null;
  const validRevenueCents = cents(parsed.value.validRevenueCents);
  const invalidRevenueCents = cents(parsed.value.invalidRevenueCents);
  const nextValidRevenue = (current?.validRevenueCents ?? 0) + validRevenueCents;
  const nextInvalidRevenue = (current?.invalidRevenueCents ?? 0) + invalidRevenueCents;
  const nextUserShare = Math.floor(nextValidRevenue * 0.25);
  const existingHeld = current?.heldCents ?? 0;
  const status: RevenueStatus = existingHeld > 0 || current?.status === 'hold' || current?.status === 'policy'
    ? current?.status ?? 'hold'
    : invalidRevenueCents > validRevenueCents
      ? 'review'
      : 'payable';
  const heldCents = status === 'payable' ? 0 : Math.max(existingHeld, nextUserShare);
  const next: RevenueAggregate = {
    slug,
    ownerSub: sanitizeText(parsed.value.ownerSub, 160) || current?.ownerSub,
    ownerEmail: sanitizeText(parsed.value.ownerEmail, 180) || current?.ownerEmail,
    profileName: sanitizeText(parsed.value.profileName, 160) || current?.profileName || slug,
    impressions: (current?.impressions ?? 0) + count(parsed.value.impressions),
    clicks: (current?.clicks ?? 0) + count(parsed.value.clicks),
    validRevenueCents: nextValidRevenue,
    invalidRevenueCents: nextInvalidRevenue,
    userShareCents: nextUserShare,
    heldCents,
    payableCents: Math.max(0, nextUserShare - heldCents),
    status,
    updatedAt: Date.now(),
  };
  const index = await getStringArray(kv, revenueIndexKey());
  await Promise.all([
    kv.put(revenueProfileKey(slug), JSON.stringify(next), { expirationTtl: ADMIN_STATE_TTL_SECONDS }),
    kv.put(revenueIndexKey(), JSON.stringify([slug, ...index.filter((item) => item !== slug)].slice(0, MAX_ADMIN_LIST)), {
      expirationTtl: ADMIN_STATE_TTL_SECONDS,
    }),
    recordAdminAudit(env, session!, 'revenue.event', slug, sanitizeText(parsed.value.source, 120) || 'manual'),
  ]);
  return jsonResponse({ ok: true, profile: next }, 201);
}

async function handleAdminRevenueHold(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:write');
  if (adminError) return adminError;

  const parsed = await readJsonBody<RevenueHoldRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const slug = slugify(sanitizeText(parsed.value.slug, MAX_REVENUE_SLUG_CHARS));
  if (!slug) return errorResponse('invalid_profile_slug', 'slug is required.', 400);
  const kv = metadataStore(env);
  const current = (await kv.get(revenueProfileKey(slug), 'json')) as RevenueAggregate | null;
  if (!current) return errorResponse('revenue_profile_not_found', 'Revenue profile not found.', 404);
  const hold = parsed.value.hold !== false;
  const next: RevenueAggregate = {
    ...current,
    status: hold ? 'hold' : 'payable',
    heldCents: hold ? current.userShareCents : 0,
    payableCents: hold ? 0 : current.userShareCents,
    updatedAt: Date.now(),
  };
  await kv.put(revenueProfileKey(slug), JSON.stringify(next), { expirationTtl: ADMIN_STATE_TTL_SECONDS });
  await recordAdminAudit(env, session!, hold ? 'revenue.hold' : 'revenue.release', slug, sanitizeText(parsed.value.reason, 800));
  return jsonResponse({ ok: true, profile: next });
}

async function handleAdminAudit(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  const adminError = requireAdmin(session, 'admin:read');
  if (adminError) return adminError;

  const url = new URL(request.url);
  const limit = Math.min(MAX_ADMIN_AUDIT, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  return jsonResponse({ ok: true, audit: await loadAdminAudit(env, limit) });
}

async function handleListMemories(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'profile:read')) return errorResponse('forbidden', 'Missing profile read permission', 403);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const twinId = sanitizeText(url.searchParams.get('twinId'), 120);
  const memories = (await loadUserMemories(env, session.sub))
    .filter((memory) => !status || memory.status === status)
    .filter((memory) => !twinId || (Array.isArray(memory.twinIds) && memory.twinIds.includes(twinId)))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return jsonResponse({
    memories,
    limits: {
      maxMemories: MAX_MEMORY_ITEMS,
      remaining: Math.max(0, MAX_MEMORY_ITEMS - memories.length),
    },
  });
}

async function handleCreateMemory(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasProfileWritePermission(session)) return errorResponse('forbidden', 'Missing profile write permission', 403);

  const parsed = await readJsonBody<MemoryWriteRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const existing = await loadUserMemories(env, session.sub);
  if (existing.length >= MAX_MEMORY_ITEMS) {
    return errorResponse('memory_limit_reached', 'Memory limit reached in the free-only MVP.', 413, {
      limit: MAX_MEMORY_ITEMS,
      mode: 'stop-before-cost',
    });
  }

  const text = sanitizeText(body.text, MAX_MEMORY_TEXT_CHARS);
  if (!text) return errorResponse('invalid_memory', 'Memory text is required.', 400);
  const now = Date.now();
  const id = crypto.randomUUID();
  const sourceType = body.sourceType === 'chat' || body.sourceType === 'upload' || body.sourceType === 'profile'
    ? body.sourceType
    : 'manual';
  if (sourceType === 'chat') {
    const chatId = sanitizeText(body.chatId, 120);
    if (!chatId || !(await metadataStore(env).get(chatKey(session.sub, chatId), 'json'))) {
      return errorResponse('memory_source_chat_not_found', 'Source chat was not found for this user.', 404);
    }
  }

  const memory: MemoryRecord = {
    id,
    userSub: session.sub,
    profileId: 'default',
    type: normalizeMemoryType(body.type),
    text,
    source: {
      type: sourceType,
      chatId: sourceType === 'chat' ? sanitizeText(body.chatId, 120) : undefined,
      uploadId: sourceType === 'upload' ? sanitizeText(body.uploadId, 120) : undefined,
      label: sanitizeText(body.sourceLabel, MAX_MEMORY_SOURCE_CHARS) || undefined,
    },
    visibility: normalizeProfileVisibility(body.visibility),
    sensitivity: body.type === 'sensitive' ? 'sensitive' : normalizeSensitivity(body.sensitivity),
    confidence: normalizeConfidence(body.confidence),
    status: normalizeMemoryStatus(body.status),
    twinIds: sanitizeList(body.twinIds, MAX_PROFILE_ITEMS),
    reviewAt: normalizeReviewAt(body.reviewAt),
    objectKey: memoryObjectKey(session.sub, id),
    createdAt: now,
    updatedAt: now,
  };
  await persistManagedObject(request, env, memory.objectKey, memory);
  await putMemory(env, memory);
  await addMemoryToIndex(env, session.sub, id);

  const profile = await loadProfile(env, session);
  const nextProfile = {
    ...profile,
    memoryCount: existing.filter((item) => item.status !== 'rejected').length + (memory.status === 'rejected' ? 0 : 1),
    updatedAt: now,
  };
  nextProfile.qualityScore = profileQualityScore(nextProfile);
  await putProfile(env, nextProfile);

  return jsonResponse({ memory }, 201);
}

async function handleGetMemory(request: Request, env: ApiEnv, memoryId: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'profile:read')) return errorResponse('forbidden', 'Missing profile read permission', 403);

  const memory = (await metadataStore(env).get(memoryKey(session.sub, memoryId), 'json')) as MemoryRecord | null;
  if (!memory) return errorResponse('memory_not_found', 'Memory not found.', 404);
  return jsonResponse({ memory });
}

async function handleUpdateMemory(request: Request, env: ApiEnv, memoryId: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasProfileWritePermission(session)) return errorResponse('forbidden', 'Missing profile write permission', 403);

  const parsed = await readJsonBody<MemoryWriteRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const current = (await metadataStore(env).get(memoryKey(session.sub, memoryId), 'json')) as MemoryRecord | null;
  if (!current) return errorResponse('memory_not_found', 'Memory not found.', 404);
  const body = parsed.value;
  const next: MemoryRecord = {
    ...current,
    type: body.type === undefined ? current.type : normalizeMemoryType(body.type),
    text: body.text === undefined ? current.text : sanitizeText(body.text, MAX_MEMORY_TEXT_CHARS) || current.text,
    visibility: body.visibility === undefined ? current.visibility : normalizeProfileVisibility(body.visibility),
    sensitivity: body.sensitivity === undefined ? current.sensitivity : normalizeSensitivity(body.sensitivity),
    confidence: body.confidence === undefined ? current.confidence : normalizeConfidence(body.confidence),
    status: body.status === undefined ? current.status : normalizeMemoryStatus(body.status),
    twinIds: body.twinIds === undefined ? current.twinIds : sanitizeList(body.twinIds, MAX_PROFILE_ITEMS),
    reviewAt: body.reviewAt === undefined ? current.reviewAt : normalizeReviewAt(body.reviewAt),
    updatedAt: Date.now(),
  };
  if (next.type === 'sensitive') next.sensitivity = 'sensitive';
  await persistManagedObject(request, env, next.objectKey, next);
  await putMemory(env, next);
  await addMemoryToIndex(env, session.sub, next.id);
  return jsonResponse({ memory: next });
}

async function handleDeleteMemory(request: Request, env: ApiEnv, memoryId: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasProfileWritePermission(session)) return errorResponse('forbidden', 'Missing profile write permission', 403);
  const deleteConfirmation = requireDeleteConfirmation(request, 'delete-memory');
  if (deleteConfirmation) return deleteConfirmation;

  const kv = metadataStore(env);
  const current = (await kv.get(memoryKey(session.sub, memoryId), 'json')) as MemoryRecord | null;
  if (!current) return errorResponse('memory_not_found', 'Memory not found.', 404);
  const tombstone: MemoryRecord = {
    ...current,
    text: '',
    visibility: 'deleted',
    status: 'rejected',
    twinIds: [],
    updatedAt: Date.now(),
  };
  await deleteManagedObject(request, env, current.objectKey);
  await putMemory(env, tombstone);
  return jsonResponse({
    ok: true,
    deleted: memoryId,
    storageNote: 'Memory metadata was tombstoned. Matching IDrive e2 object keys are covered by account/storage deletion and orphan audits.',
  });
}

async function handleSearchChats(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'chat:read')) return errorResponse('forbidden', 'Missing chat read permission', 403);

  const url = new URL(request.url);
  const query = sanitizeText(url.searchParams.get('q'), MAX_CHAT_SEARCH_QUERY_CHARS);
  const twinId = sanitizeText(url.searchParams.get('twinId'), 120);
  const chats = await loadUserChats(env, session.sub);
  const normalizedQuery = normalizedQuestion(query);
  const terms = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);
  const results = chats
    .filter((chat) => !twinId || chat.twinId === twinId || chat.publicTwinSlug === twinId)
    .map((chat) => {
      const haystack = normalizedQuestion([
        chat.title,
        chat.summary ?? '',
        ...chat.messages.map((message) => message.content),
      ].join(' '));
      const score = terms.length
        ? terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
        : 1;
      return { chat, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.chat.updatedAt - a.chat.updatedAt)
    .slice(0, 25)
    .map(({ chat, score }) => ({
      id: chat.id,
      title: chat.title,
      twinId: chat.twinId ?? null,
      publicTwinSlug: chat.publicTwinSlug ?? null,
      summary: chat.summary ?? summarizeChat(chat.messages),
      messageCount: chat.messages.length,
      archiveObjectKey: chat.archiveObjectKey ?? chatArchiveObjectKey(session.sub, chat.id, chat.createdAt),
      score,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }));

  return jsonResponse({ query, results });
}

async function handleStartChat(request: Request, env: ApiEnv, ctx?: ExecutionContext): Promise<Response> {
  let body: ChatStartRequest = {};
  const parsed = await readJsonBody<ChatStartRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  body = parsed.value;

  const session = await authenticate(request, env);
  if (session && !hasPermission(session, 'chat:write')) return errorResponse('forbidden', 'Missing chat write permission', 403);

  let twin: TwinRecord | null = null;
  let publicTwin: TwinRecord | null = null;
  if (typeof body.twinId === 'string' && body.twinId) {
    if (session) twin = await loadTwinForUser(env, session.sub, body.twinId);
    if (!twin) publicTwin = await loadPublicTwin(env, slugify(body.twinId));
    if (!twin && (!publicTwin || publicTwin.visibility !== 'public')) {
      return errorResponse('twin_not_found', 'Twin not found', 404);
    }
  }
  if (!session) {
    if (!publicTwin || publicTwin.visibility !== 'public') {
      return errorResponse('unauthorized', 'Sign in is required for private chats.', 401);
    }
    const now = Date.now();
    return jsonResponse({
      chat: {
        id: publicChatId(publicTwin.slug),
        userSub: 'public',
        title: `Chat mit ${publicTwin.name}`,
        publicTwinSlug: publicTwin.slug,
        messages: [],
        createdAt: now,
        updatedAt: now,
        transient: true,
      },
    });
  }

  const now = Date.now();
  const titleName = twin?.name ?? publicTwin?.name;
  const chat: ChatRecord = {
    id: crypto.randomUUID(),
    userSub: session.sub,
    title: titleName ? `Chat mit ${titleName}` : 'Twin Chat',
    twinId: twin?.id,
    publicTwinSlug: publicTwin?.slug,
    messages: [],
    summary: 'Neuer Chat.',
    archiveObjectKey: '',
    sensitivity: 'normal',
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  };
  chat.archiveObjectKey = chatArchiveObjectKey(session.sub, chat.id, chat.createdAt);
  try {
    await putChat(env, chat);
    persistManagedObjectLater(ctx, request, env, chat.archiveObjectKey, chat);
  } catch (err) {
    if (publicTwin && !twin) {
      console.warn('public_chat_storage_unavailable', JSON.stringify({ slug: publicTwin.slug, error: String(err) }));
      return jsonResponse({
        chat: {
          ...chat,
          id: publicChatId(publicTwin.slug),
          transient: true,
        },
      });
    }
    throw err;
  }

  try {
    await addChatToIndex(env, session.sub, chat.id);
  } catch (err) {
    console.warn('chat_index_update_failed', JSON.stringify({ userSub: session.sub, chatId: chat.id, error: String(err) }));
  }

  return jsonResponse({ chat });
}

async function handleListChats(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'chat:read')) return errorResponse('forbidden', 'Missing chat read permission', 403);

  const kv = metadataStore(env);
  const ids = await getStringArray(kv, chatIndexKey(session.sub));
  const records = await Promise.all(
    ids.slice(0, MAX_INDEX_READS).map((id) => kv.get(chatKey(session.sub, id), 'json') as Promise<ChatRecord | null>),
  );

  return jsonResponse({
    chats: records
      .filter((record): record is ChatRecord => Boolean(record))
      .map((record) => ({
        id: record.id,
        title: record.title,
        twinId: record.twinId ?? null,
        publicTwinSlug: record.publicTwinSlug ?? null,
        messages: record.messages,
        summary: record.summary ?? summarizeChat(record.messages),
        archiveObjectKey: record.archiveObjectKey ?? chatArchiveObjectKey(session.sub, record.id, record.createdAt),
        visibility: record.visibility ?? 'private',
        sensitivity: record.sensitivity ?? 'normal',
        messageCount: record.messages.length,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
  });
}

function freeOnlyReply(input: string): string {
  const trimmed = input.trim();
  const short = trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed;
  return [
    `Ich habe deine Nachricht erhalten: "${short}"`,
    'Ich kann gerade nur allgemein antworten, aber ich bleibe beim Thema und formuliere so hilfreich wie moeglich.',
    'Erzaehle mir etwas mehr Kontext, dann kann die Antwort gezielter werden.',
  ].join(' ');
}

async function handleCreateTwin(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'twin:write')) return errorResponse('forbidden', 'Missing twin write permission', 403);

  const parsed = await readJsonBody<TwinCreateRequest>(request, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const name = sanitizeText(body.name, MAX_TWIN_NAME_CHARS);
  if (!name) return errorResponse('invalid_twin_name', 'Twin name is required', 400);
  const imageKey = sanitizeText(body.imageKey, 800);
  if (imageKey && !ownsUserKey(imageKey, session.sub)) {
    return errorResponse('invalid_profile_image_key', 'Profile image key must belong to the authenticated user', 403);
  }

  const now = Date.now();
  const twin: TwinRecord = {
    id: crypto.randomUUID(),
    userSub: session.sub,
    name,
    slug: await uniqueSlug(env, sanitizeText(body.slug, 80) || name),
    description: sanitizeText(body.description, MAX_TWIN_DESCRIPTION_CHARS),
    imageUrl: privateSafeImageUrl(env, body.imageUrl),
    imageKey: imageKey || undefined,
    categories: sanitizeList(body.categories),
    languages: sanitizeLanguageList(body.languages),
    visibility: normalizeVisibility(body.visibility),
    style: normalizeStyle(body.style),
    knowledgeTexts: [],
    mediaRefs: [],
    contextSummary: '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  twin.contextSummary = buildTwinContext(twin);
  await putTwin(env, twin);
  await syncPublicTwin(env, twin);
  await addTwinToIndex(env, session.sub, twin.id);

  return jsonResponse({ twin, mode: 'free-only-twin-mvp' }, 201);
}

async function handleListTwins(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'twin:read')) return errorResponse('forbidden', 'Missing twin read permission', 403);

  const kv = metadataStore(env);
  const ids = await getStringArray(kv, twinIndexKey(session.sub));
  const records = await Promise.all(
    ids.slice(0, MAX_INDEX_READS).map((id) => kv.get(twinKey(session.sub, id), 'json') as Promise<TwinRecord | null>),
  );

  return jsonResponse({
    twins: records
      .filter((record): record is TwinRecord => Boolean(record))
      .map((record) => record),
  });
}

async function handleGetTwin(request: Request, env: ApiEnv, twinId: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'twin:read')) return errorResponse('forbidden', 'Missing twin read permission', 403);

  const twin = await loadTwinForUser(env, session.sub, twinId);
  if (!twin) return errorResponse('twin_not_found', 'Twin not found', 404);
  return jsonResponse({ twin });
}

async function handleUpdateTwin(request: Request, env: ApiEnv, twinId: string): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'twin:write')) return errorResponse('forbidden', 'Missing twin write permission', 403);

  const parsed = await readJsonBody<TwinUpdateRequest>(request, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const twin = await loadTwinForUser(env, session.sub, twinId);
  if (!twin) return errorResponse('twin_not_found', 'Twin not found', 404);
  const imageKey = body.imageKey === undefined ? undefined : sanitizeText(body.imageKey, 800);
  if (imageKey && !ownsUserKey(imageKey, session.sub)) {
    return errorResponse('invalid_profile_image_key', 'Profile image key must belong to the authenticated user', 403);
  }

  const previous = { ...twin };
  const next: TwinRecord = {
    ...twin,
    name: body.name === undefined ? twin.name : sanitizeText(body.name, MAX_TWIN_NAME_CHARS) || twin.name,
    slug:
      body.slug === undefined
        ? twin.slug ?? (await uniqueSlug(env, twin.name, twin.id))
        : await uniqueSlug(env, sanitizeText(body.slug, 80) || twin.name, twin.id),
    description:
      body.description === undefined ? twin.description : sanitizeText(body.description, MAX_TWIN_DESCRIPTION_CHARS),
    imageUrl: body.imageUrl === undefined ? twin.imageUrl : privateSafeImageUrl(env, body.imageUrl),
    imageKey: body.imageKey === undefined ? twin.imageKey : imageKey || undefined,
    categories: body.categories === undefined ? twin.categories ?? [] : sanitizeList(body.categories),
    languages: body.languages === undefined ? twin.languages ?? [] : sanitizeLanguageList(body.languages),
    visibility: body.visibility === undefined ? twin.visibility : normalizeVisibility(body.visibility),
    style: body.style === undefined ? twin.style : normalizeStyle(body.style),
    updatedAt: Date.now(),
  };
  next.contextSummary = buildTwinContext(next);
  next.status = next.knowledgeTexts.length || next.description || next.mediaRefs.length ? 'ready' : 'draft';
  await putTwin(env, next);
  await syncPublicTwin(env, next, previous);
  await addTwinToIndex(env, session.sub, next.id);

  return jsonResponse({ twin: next });
}

async function handleAddKnowledge(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'twin:write')) return errorResponse('forbidden', 'Missing twin write permission', 403);

  const parsed = await readJsonBody<TwinKnowledgeRequest>(request, 64 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const twinId = sanitizeText(body.twinId, 120);
  const text = sanitizeText(body.text, MAX_TWIN_KNOWLEDGE_CHARS);
  if (!twinId || !text) return errorResponse('invalid_twin_knowledge', 'twinId and text are required', 400);

  const twin = await loadTwinForUser(env, session.sub, twinId);
  if (!twin) return errorResponse('twin_not_found', 'Twin not found', 404);
  if (twin.knowledgeTexts.length >= MAX_KNOWLEDGE_ITEMS) {
    return errorResponse('knowledge_limit_reached', 'Knowledge item limit reached', 413);
  }

  const now = Date.now();
  const item: TwinKnowledgeItem = {
    id: crypto.randomUUID(),
    title: sanitizeText(body.title, 180) || undefined,
    text,
    createdAt: now,
  };
  const next: TwinRecord = {
    ...twin,
    knowledgeTexts: [...twin.knowledgeTexts, item],
    status: 'ready',
    updatedAt: now,
  };
  next.contextSummary = buildTwinContext(next);
  await putTwin(env, next);
  await syncPublicTwin(env, next, twin);
  await addTwinToIndex(env, session.sub, next.id);

  return jsonResponse({ twin: next, item }, 201);
}

async function handleAddMediaRef(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'twin:write')) return errorResponse('forbidden', 'Missing twin write permission', 403);

  const parsed = await readJsonBody<TwinMediaRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const twinId = sanitizeText(body.twinId, 120);
  const key = sanitizeText(body.key, 800);
  const category = sanitizeText(body.category, 80);
  if (!twinId || !key || !category) {
    return errorResponse('invalid_twin_media', 'twinId, key and category are required', 400);
  }
  if (!ownsUserKey(key, session.sub)) {
    return errorResponse('invalid_storage_key', 'Storage key must belong to the authenticated user', 403);
  }

  const twin = await loadTwinForUser(env, session.sub, twinId);
  if (!twin) return errorResponse('twin_not_found', 'Twin not found', 404);
  if (twin.mediaRefs.length >= MAX_TWIN_MEDIA_REFS) {
    return errorResponse('media_ref_limit_reached', 'Media reference limit reached', 413);
  }

  const now = Date.now();
  const media: TwinMediaRef = {
    id: crypto.randomUUID(),
    uploadId: sanitizeText(body.uploadId, 120) || undefined,
    key,
    category,
    contentType: sanitizeText(body.contentType, 120) || undefined,
    filename: sanitizeText(body.filename, 220) || undefined,
    size: typeof body.size === 'number' && Number.isFinite(body.size) && body.size >= 0 ? body.size : undefined,
    createdAt: now,
  };
  const next: TwinRecord = {
    ...twin,
    mediaRefs: [...twin.mediaRefs, media],
    status: 'ready',
    updatedAt: now,
  };
  next.contextSummary = buildTwinContext(next);
  await putTwin(env, next);
  await syncPublicTwin(env, next, twin);
  await addTwinToIndex(env, session.sub, next.id);

  return jsonResponse({ twin: next, media }, 201);
}

async function handlePublicTwin(request: Request, env: ApiEnv, slug: string): Promise<Response> {
  const cleanSlug = slugify(slug);
  if (!cleanSlug) return errorResponse('invalid_slug', 'Invalid profile slug', 400);
  const twin = await loadPublicTwin(env, cleanSlug);
  if (!twin || !isPublicTwinDiscoverable(env, twin)) {
    return errorResponse('public_twin_not_found', 'Public twin not found', 404);
  }

  const limited = await requireRateLimit(metadataStore(env), {
    key: clientKey(request, 'api:public-twin'),
    limit: 240,
    windowSeconds: 60,
  });
  if (limited) return limited;

  return jsonResponse({ twin: publicTwinPayload(env, twin) }, 200, {
    'cache-control': 'public, max-age=120, s-maxage=600',
    'X-Robots-Tag': 'index, follow',
  });
}

async function handlePublicTwinImage(request: Request, env: ApiEnv, slugFile: string): Promise<Response> {
  const slug = slugify(slugFile.replace(/\.svg$/i, ''));
  const spec = CURATED_PUBLIC_TWIN_SPECS.find((item) => item.slug === slug && item.generatedPortrait);
  if (!spec) return errorResponse('public_twin_image_not_found', 'Public twin image not found', 404);

  const limited = await requireRateLimit(metadataStore(env), {
    key: clientKey(request, 'api:public-twin-image'),
    limit: 360,
    windowSeconds: 60,
  });
  if (limited) return limited;

  return withSecurity(new Response(request.method === 'HEAD' ? null : generatedTwinPortraitSvg(spec), {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=604800',
      'X-Robots-Tag': 'index, follow',
    },
  }));
}

async function handlePublicTwinList(request: Request, env: ApiEnv): Promise<Response> {
  const limited = await requireRateLimit(metadataStore(env), {
    key: clientKey(request, 'api:public-twins'),
    limit: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const listed = await metadataStore(env).list({ prefix: 'public:twin:', limit: MAX_PUBLIC_DISCOVERY_READS });
  const records = await Promise.all(
    listed.keys.map((item) => metadataStore(env).get(item.name, 'json') as Promise<TwinRecord | null>),
  );
  const bySlug = new Map<string, TwinRecord>();
  for (const record of records) {
    if (record && isPublicTwinDiscoverable(env, record)) {
      bySlug.set(record.slug, record);
    }
  }
  for (const twin of curatedPublicTwins(env)) {
    bySlug.set(twin.slug, twin);
  }
  const twins = Array.from(bySlug.values())
    .filter((record): record is TwinRecord => Boolean(record && isPublicTwinDiscoverable(env, record)))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'de'))
    .map((twin) => publicTwinPayload(env, twin));

  return jsonResponse({ twins }, 200, {
    'cache-control': 'public, max-age=60, s-maxage=300',
    'X-Robots-Tag': 'index, follow',
  });
}

async function handleChatMessage(request: Request, env: ApiEnv, ctx?: ExecutionContext): Promise<Response> {
  const parsed = await readJsonBody<ChatMessageRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!body.chatId || !message) {
    return errorResponse('invalid_chat_message', 'chatId and message are required', 400);
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return errorResponse('message_too_large', 'Message is too large', 413);
  }

  const transientPublicSlug = publicSlugFromChatId(body.chatId);
  const session = await authenticate(request, env);
  if (!session && !transientPublicSlug) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (session && !hasPermission(session, 'chat:write')) return errorResponse('forbidden', 'Missing chat write permission', 403);

  const kv = metadataStore(env);
  let chat = session ? (await kv.get(chatKey(session.sub, body.chatId), 'json')) as ChatRecord | null : null;
  if (!chat && transientPublicSlug) {
    chat = {
      id: body.chatId,
      userSub: session?.sub ?? 'public',
      title: 'Public Twin Chat',
      publicTwinSlug: transientPublicSlug,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  if (!chat) return errorResponse('chat_not_found', 'Chat not found', 404);
  const twin = chat.twinId
    ? session ? await loadTwinForUser(env, session.sub, chat.twinId) : null
    : chat.publicTwinSlug
      ? await loadPublicTwin(env, chat.publicTwinSlug)
      : null;
  if (!twin && chat.publicTwinSlug) return errorResponse('public_twin_not_found', 'Public twin not found', 404);

  const now = Date.now();
  const profileMemoryId = chat.twinId ?? chat.publicTwinSlug ?? null;
  const promptMemoryKey = session && profileMemoryId ? recentPromptKey(session.sub, profileMemoryId) : null;
  const promptMemory = promptMemoryKey
    ? (await kv.get(promptMemoryKey, 'json')) as ChatRecentPromptMemory | null
    : null;
  const replyHistory = [
    ...recentPromptHistory(promptMemory, now),
    ...chat.messages,
  ].slice(-MAX_CHAT_MESSAGES);
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    createdAt: now,
  };
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: twin
      ? ruleBasedTwinReply(message, twin, replyHistory, `${body.chatId}|${now}|${replyHistory.length}`)
      : freeOnlyReply(message),
    createdAt: now,
  };

  const next: ChatRecord = {
    ...chat,
    messages: [...chat.messages, userMessage, assistantMessage].slice(-MAX_CHAT_MESSAGES),
    summary: summarizeChat([...chat.messages, userMessage, assistantMessage].slice(-MAX_CHAT_MESSAGES)),
    archiveObjectKey: session
      ? chat.archiveObjectKey ?? chatArchiveObjectKey(session.sub, chat.id, chat.createdAt)
      : chat.archiveObjectKey,
    sensitivity: chat.sensitivity ?? 'normal',
    visibility: chat.visibility ?? 'private',
    updatedAt: now,
  };
  if (session) {
    try {
      await putChat(env, next);
      if (next.archiveObjectKey) {
        persistManagedObjectLater(ctx, request, env, next.archiveObjectKey, next);
      }
      await addChatToIndex(env, session.sub, next.id);
      if (promptMemoryKey) {
        await kv.put(promptMemoryKey, JSON.stringify(nextRecentPromptMemory(promptMemory, message, now)));
      }
    } catch (err) {
      if (!chat.publicTwinSlug) throw err;
      console.warn('public_chat_persistence_failed', JSON.stringify({
        userSub: session.sub,
        chatId: next.id,
        publicTwinSlug: chat.publicTwinSlug,
        error: String(err),
      }));
    }
  }

  const compute = computeConfiguration(env);
  const computeQueued = compute.ready && Boolean(session);
  if (computeQueued) {
    const enqueue = enqueueComputeJob(env, {
      type: 'chat_inference',
      priority: 90,
      target: `chats/${safePathSegment(next.id)}`,
      idempotencyKey: `chat:${session!.sub}:${next.id}:${userMessage.id}`,
      userSub: session!.sub,
      maxAttempts: 3,
      payload: {
        chatId: next.id,
        twinId: chat.twinId ?? null,
        publicTwinSlug: chat.publicTwinSlug ?? null,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        userMessage: userMessage.content,
        fallbackReply: assistantMessage.content,
        recentMessages: next.messages.slice(-8),
        archiveObjectKey: next.archiveObjectKey ?? null,
        requestedAt: now,
      },
    }).catch((err) => {
      console.warn('compute_chat_enqueue_failed', JSON.stringify({
        chatId: next.id,
        error: String(err),
      }));
    });
    if (ctx) ctx.waitUntil(enqueue);
    else await enqueue;
  }
  return jsonResponse({
    chatId: next.id,
    message: assistantMessage,
    twinId: chat.twinId ?? chat.publicTwinSlug ?? null,
    mode: twin ? 'free-only-twin-mvp' : 'free-only-static',
    compute: {
      mode: compute.mode,
      provider: compute.ready ? 'salad' : 'cloudflare-fallback',
      streaming: compute.streamingEnabled,
      queued: computeQueued,
    },
  });
}

export default {
  async fetch(request: Request, env: ApiEnv, ctx?: ExecutionContext): Promise<Response> {
    return safeHandler(async () => {
      const url = new URL(request.url);
      const kv = metadataStore(env);

      if (request.method === 'OPTIONS') {
        return strictCorsPreflight(request, env.CANONICAL_HOST, 'GET, POST, PATCH, DELETE');
      }

      if (url.pathname === '/api/compute/jobs/lease' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:compute-lease'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleComputeLease(request, env);
      }

      if (url.pathname === '/api/compute/jobs/complete' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:compute-complete'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleComputeComplete(request, env);
      }

      const computeCallbackRoute = url.pathname === '/api/compute/jobs/lease' || url.pathname === '/api/compute/jobs/complete';
      const csrf = computeCallbackRoute ? null : requireSameOrigin(request, env.CANONICAL_HOST);
      if (csrf) {
        return csrf;
      }

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return handleHealth(env);
      }

      if (url.pathname === '/api/compute/capabilities' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:compute-capabilities'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleComputeCapabilities(env);
      }

      if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-overview'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminOverview(request, env);
      }

      if (url.pathname === '/api/admin/compute/jobs' && (request.method === 'GET' || request.method === 'POST')) {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-compute-jobs'),
          limit: request.method === 'POST' ? 30 : 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminComputeJobs(request, env);
      }

      if (url.pathname === '/api/admin/compute/runtime' && (request.method === 'GET' || request.method === 'POST')) {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-compute-runtime'),
          limit: request.method === 'POST' ? 10 : 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminComputeRuntime(request, env);
      }

      if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-users'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminUsers(request, env);
      }

      if (url.pathname === '/api/admin/users/block' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-user-block'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminBlockUser(request, env);
      }

      if (url.pathname === '/api/admin/users/unblock' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-user-unblock'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminUnblockUser(request, env);
      }

      if (url.pathname === '/api/admin/revenue/summary' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-revenue-summary'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminRevenueSummary(request, env);
      }

      if (url.pathname === '/api/admin/revenue/events' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-revenue-event'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminRevenueEvent(request, env);
      }

      if (url.pathname === '/api/admin/revenue/hold' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-revenue-hold'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminRevenueHold(request, env);
      }

      if (url.pathname === '/api/admin/audit' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:admin-audit'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAdminAudit(request, env);
      }

      if (url.pathname === '/api/profile' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:profile-get'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleGetProfile(request, env);
      }

      if (url.pathname === '/api/profile' && request.method === 'PATCH') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:profile-update'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleUpdateProfile(request, env);
      }

      if (url.pathname === '/api/account/export' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:account-export'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAccountExport(request, env);
      }

      if (url.pathname === '/api/account' && request.method === 'DELETE') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:account-delete'),
          limit: 5,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAccountDelete(request, env);
      }

      if (url.pathname === '/api/support/report' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:support-report'),
          limit: 8,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleSupportReport(request, env);
      }

      if (url.pathname === '/api/memories' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:memory-list'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleListMemories(request, env);
      }

      if (url.pathname === '/api/memories' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:memory-create'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleCreateMemory(request, env);
      }

      if (url.pathname.startsWith('/api/memories/') && request.method === 'GET') {
        const memoryId = decodeURIComponent(url.pathname.slice('/api/memories/'.length));
        return handleGetMemory(request, env, memoryId);
      }

      if (url.pathname.startsWith('/api/memories/') && request.method === 'PATCH') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:memory-update'),
          limit: 40,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const memoryId = decodeURIComponent(url.pathname.slice('/api/memories/'.length));
        return handleUpdateMemory(request, env, memoryId);
      }

      if (url.pathname.startsWith('/api/memories/') && request.method === 'DELETE') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:memory-delete'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const memoryId = decodeURIComponent(url.pathname.slice('/api/memories/'.length));
        return handleDeleteMemory(request, env, memoryId);
      }

      if (url.pathname === '/api/public/twins' && request.method === 'GET') {
        return handlePublicTwinList(request, env);
      }

      if (url.pathname.startsWith('/api/public/twin-images/') && (request.method === 'GET' || request.method === 'HEAD')) {
        const slugFile = decodeURIComponent(url.pathname.slice('/api/public/twin-images/'.length));
        return handlePublicTwinImage(request, env, slugFile);
      }

      if (url.pathname.startsWith('/api/public/twins/') && request.method === 'GET') {
        const slug = decodeURIComponent(url.pathname.slice('/api/public/twins/'.length));
        return handlePublicTwin(request, env, slug);
      }

      if (url.pathname === '/api/chat/start' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:chat-start'),
          limit: 30,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleStartChat(request, env, ctx);
      }

      if (url.pathname === '/api/chat/messages' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:chat-message'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleChatMessage(request, env, ctx);
      }

      if (url.pathname === '/api/chat/list' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:chat-list'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleListChats(request, env);
      }

      if (url.pathname === '/api/chat/search' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:chat-search'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleSearchChats(request, env);
      }

      if (url.pathname === '/api/twins' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:twin-create'),
          limit: 20,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleCreateTwin(request, env);
      }

      if (url.pathname === '/api/twins' && request.method === 'GET') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:twin-list'),
          limit: 120,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleListTwins(request, env);
      }

      if (url.pathname === '/api/twins/knowledge' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:twin-knowledge'),
          limit: 40,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAddKnowledge(request, env);
      }

      if (url.pathname === '/api/twins/media' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:twin-media'),
          limit: 80,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleAddMediaRef(request, env);
      }

      if (url.pathname.startsWith('/api/twins/') && request.method === 'GET') {
        const twinId = decodeURIComponent(url.pathname.slice('/api/twins/'.length));
        return handleGetTwin(request, env, twinId);
      }

      if (url.pathname.startsWith('/api/twins/') && request.method === 'PATCH') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:twin-update'),
          limit: 40,
          windowSeconds: 60,
        });
        if (limited) return limited;
        const twinId = decodeURIComponent(url.pathname.slice('/api/twins/'.length));
        return handleUpdateTwin(request, env, twinId);
      }

      const allowed = allowedMethodsForApiPath(url.pathname);
      if (allowed) return methodNotAllowed(allowed);
      return errorResponse('not_found', 'Not found', 404);
    }, request);
  },
};
