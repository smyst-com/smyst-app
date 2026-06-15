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
}

const SESSION_COOKIE = 'smyst_session';
const MAX_MESSAGE_CHARS = 2000;
const MAX_CHAT_MESSAGES = 20;
const MAX_TWIN_NAME_CHARS = 120;
const MAX_TWIN_DESCRIPTION_CHARS = 2000;
const MAX_TWIN_KNOWLEDGE_CHARS = 12000;
const MAX_KNOWLEDGE_ITEMS = 20;
const MAX_TWIN_MEDIA_REFS = 50;
const MAX_PROFILE_FIELD_CHARS = 80;
const MAX_PROFILE_ITEMS = 12;
const MAX_INDEX_READS = 50;
const MAX_PUBLIC_DISCOVERY_READS = 100;
const MAX_REPORT_SUBJECT_CHARS = 160;
const MAX_REPORT_MESSAGE_CHARS = 4000;
const MAX_REPORT_CONTACT_CHARS = 180;
const TWIN_TTL_SECONDS = 60 * 60 * 24 * 370;
const REPORT_TTL_SECONDS = 60 * 60 * 24 * 370;
const SUPPORTED_PROFILE_LANGS = new Set(['de', 'en', 'tr', 'fr', 'es', 'pt', 'ar', 'zh', 'ja', 'ko']);

function allowedMethodsForApiPath(pathname: string): string[] | null {
  if (pathname === '/api/health') return ['GET'];
  if (pathname === '/api/account/export') return ['GET'];
  if (pathname === '/api/account') return ['DELETE'];
  if (pathname === '/api/support/report') return ['POST'];
  if (pathname === '/api/public/twins') return ['GET'];
  if (pathname.startsWith('/api/public/twin-images/')) return ['GET', 'HEAD'];
  if (pathname.startsWith('/api/public/twins/')) return ['GET'];
  if (pathname === '/api/chat/start') return ['POST'];
  if (pathname === '/api/chat/messages') return ['POST'];
  if (pathname === '/api/chat/list') return ['GET'];
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
  createdAt: number;
  updatedAt: number;
}

interface ChatStartRequest {
  twinId?: string;
}

interface ChatMessageRequest {
  chatId: string;
  message: string;
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

function metadataStore(env: ApiEnv): KVNamespace {
  return env.METADATA ?? env.SESSIONS;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function authenticate(request: Request, env: ApiEnv): Promise<SessionData | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const data = (await env.SESSIONS.get(`s:${sessionId}`, 'json')) as SessionData | null;
  if (!data || data.expiresAt < Date.now()) return null;
  return data;
}

function hasPermission(session: SessionData, permission: string): boolean {
  return session.permissions?.includes(permission) ?? false;
}

function chatKey(userSub: string, chatId: string): string {
  return `meta:chat:${userSub}:${chatId}`;
}

function chatIndexKey(userSub: string): string {
  return `meta:chats:${userSub}`;
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
        text: `Antwortstil: ${spec.answerStyle}. Nutzer sollen sofort merken, dass dieses Profil als ${spec.name} mit eigener Perspektive antwortet und nicht als generische KI.`,
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
      `${spec.name} ist ein oeffentliches digitales Twin-Profil auf smyst.com. Profil: ${spec.description} Kategorien: ${spec.categories.join(', ')}. Sprachen: ${CURATED_PUBLIC_TWIN_LANGUAGES.join(', ')}. Kommunikationsstil: ${spec.style}. Antwortstil: ${spec.answerStyle}.`,
    guardrail:
      'Antwortet als historisch inspiriertes KI-Profil. Es behauptet nicht, die echte verstorbene Person zu sein, gibt keine medizinische, rechtliche oder finanzielle Garantie und soll moderne Fakten nicht erfinden.',
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
  const value = (await kv.get(key, 'json')) as T | null;
  return value ?? fallback;
}

async function putChat(env: ApiEnv, chat: ChatRecord): Promise<void> {
  await metadataStore(env).put(chatKey(chat.userSub, chat.id), JSON.stringify(chat), {
    expirationTtl: 60 * 60 * 24 * 90,
  });
}

async function addChatToIndex(env: ApiEnv, userSub: string, chatId: string): Promise<void> {
  const kv = metadataStore(env);
  const key = chatIndexKey(userSub);
  const current = await getJson<string[]>(kv, key, []);
  const next = [chatId, ...current.filter((id) => id !== chatId)].slice(0, 50);
  await kv.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function putTwin(env: ApiEnv, twin: TwinRecord): Promise<void> {
  await metadataStore(env).put(twinKey(twin.userSub, twin.id), JSON.stringify(twin), {
    expirationTtl: TWIN_TTL_SECONDS,
  });
}

async function addTwinToIndex(env: ApiEnv, userSub: string, twinId: string): Promise<void> {
  const kv = metadataStore(env);
  const key = twinIndexKey(userSub);
  const current = await getJson<string[]>(kv, key, []);
  const next = [twinId, ...current.filter((id) => id !== twinId)].slice(0, 50);
  await kv.put(key, JSON.stringify(next), { expirationTtl: TWIN_TTL_SECONDS });
}

async function loadTwinForUser(env: ApiEnv, userSub: string, twinId: string): Promise<TwinRecord | null> {
  return (await metadataStore(env).get(twinKey(userSub, twinId), 'json')) as TwinRecord | null;
}

async function loadPublicTwin(env: ApiEnv, slug: string): Promise<TwinRecord | null> {
  const curated = curatedPublicTwinBySlug(env, slug);
  if (curated) return curated;
  const stored = (await metadataStore(env).get(publicTwinKey(slug), 'json')) as TwinRecord | null;
  return stored;
}

async function loadUserChats(env: ApiEnv, userSub: string): Promise<ChatRecord[]> {
  const kv = metadataStore(env);
  const ids = await getJson<string[]>(kv, chatIndexKey(userSub), []);
  const records = await Promise.all(
    ids.slice(0, MAX_INDEX_READS).map((id) => kv.get(chatKey(userSub, id), 'json') as Promise<ChatRecord | null>),
  );
  return records.filter((record): record is ChatRecord => Boolean(record));
}

async function loadUserTwins(env: ApiEnv, userSub: string): Promise<TwinRecord[]> {
  const kv = metadataStore(env);
  const ids = await getJson<string[]>(kv, twinIndexKey(userSub), []);
  const records = await Promise.all(
    ids.slice(0, MAX_INDEX_READS).map((id) => kv.get(twinKey(userSub, id), 'json') as Promise<TwinRecord | null>),
  );
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
    `${twin.name} ist ein öffentliches digitales Twin-Profil auf smyst.com.`,
    twin.description ? `Profil: ${twin.description}` : '',
    categories,
    languages,
    `Kommunikationsstil: ${twin.style}.`,
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
  if (twin.description.trim().length < 40) issues.push('description_too_short');
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
  if (style === 'direct') return 'Kurz und direkt gesagt:';
  if (style === 'humorous') return 'Mit einem lockeren Blick darauf:';
  if (style === 'wise') return 'Bedacht formuliert:';
  if (style === 'neutral') return 'Sachlich betrachtet:';
  return 'Aus meiner Perspektive:';
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

function questionIntent(input: string): { label: string; decisionNoun: string; action: string; caution: string } {
  const normalized = input.toLowerCase();
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
      action: 'eine zentrale Profilidee in heutige Sprache übersetzen',
      caution: 'keine moderne Behauptung erfinden, die nicht zur historischen Linse passt',
    };
  }
  if (includesAny(normalized, ['jungen menschen', 'junger mensch', 'young person', 'jugend', 'heute raten', 'ratest du heute'])) {
    return {
      label: 'Lebensrat',
      decisionNoun: 'Rat',
      action: 'einen kurzen, brauchbaren Rat für Lernen, Charakter und Mut geben',
      caution: 'nicht predigen, sondern konkret und menschlich bleiben',
    };
  }
  if (includesAny(normalized, ['geschäftsidee', 'business idea', 'startup', 'produktidee'])) {
    return {
      label: 'Geschäftsidee',
      decisionNoun: 'Idee',
      action: 'klein testen, Zahlungsbereitschaft messen und erst danach skalieren',
      caution: 'nicht in Features verlieben, bevor ein echtes Problem belegt ist',
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

function styleLens(style: TwinStyle): { voice: string; verb: string; close: string } {
  if (style === 'direct') {
    return { voice: 'direkt, knapp und entscheidungsorientiert', verb: 'Ich würde priorisieren', close: 'Meine klare Empfehlung' };
  }
  if (style === 'humorous') {
    return { voice: 'locker, bildhaft und trotzdem nützlich', verb: 'Ich würde den Ball flach halten und prüfen', close: 'Mein augenzwinkerndes Fazit' };
  }
  if (style === 'wise') {
    return { voice: 'ruhig, abwägend und langfristig', verb: 'Ich würde zuerst verstehen', close: 'Meine bedachte Empfehlung' };
  }
  if (style === 'neutral') {
    return { voice: 'neutral, strukturiert und faktenorientiert', verb: 'Ich würde analysieren', close: 'Meine sachliche Empfehlung' };
  }
  return { voice: 'warm, persönlich und ermutigend', verb: 'Ich würde behutsam beginnen mit', close: 'Meine persönliche Empfehlung' };
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
  return 'Profilwissen, Erfahrung, Zielklarheit und realistische nächste Schritte';
}

function signatureLens(twin: TwinRecord): string {
  const options = [
    'Ich achte besonders auf den kleinsten belastbaren Test.',
    'Ich schaue zuerst auf Risiken, die man später schwer korrigieren kann.',
    'Ich gewichte Menschen, Timing und Vertrauen stärker als reine Zahlen.',
    'Ich suche nach dem einfachsten Modell, das die Lage ehrlich erklärt.',
    'Ich frage, welche Entscheidung auch in sechs Monaten noch vernünftig wirkt.',
    'Ich trenne Wunschdenken von beobachtbarem Verhalten.',
  ];
  const seed = `${twin.name}|${twin.description}|${(twin.categories ?? []).join(',')}|${twin.style}`;
  return options[hashText(seed) % options.length] ?? options[0];
}

function intentMove(twin: TwinRecord, intentLabel: string): string {
  const moves: Record<string, string[]> = {
    'Identität': [
      'Ich stelle mich über Rolle, Epoche und Denkweise vor, nicht als echte wiederkehrende Person.',
      'Ich beginne mit dem, wofür dieses Profil bekannt ist, und mache die Grenze zur historischen Realität klar.',
      'Ich erkläre zuerst meine Perspektive, damit du weißt, aus welcher Linse ich antworte.',
      'Ich nenne kurz Herkunft, Arbeit und Denkstil, bevor ich Rat gebe.',
      'Ich mache sichtbar, welche Fragen dieses Profil besonders gut beleuchten kann.',
      'Ich halte die Vorstellung knapp: Name, Rolle, Haltung und ein klarer Nutzen für dein Gespräch.',
    ],
    'Kernidee': [
      'Ich verdichte mein Denken auf eine tragende Idee, die heute noch handlungsfähig macht.',
      'Ich suche den Grundsatz, der hinter Werk, Entscheidung und Wirkung dieses Profils steht.',
      'Ich formuliere die wichtigste Idee als praktischen Prüfstein für heutige Fragen.',
      'Ich trenne den historischen Kern von moderner Übertreibung.',
      'Ich wähle eine Idee, die zum Profil passt und dir sofort Orientierung gibt.',
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
    'Geschäftsidee': [
      'Ich prüfe zuerst, ob jemand heute schon für dieses Problem zahlt.',
      'Ich würde die Zielgruppe enger schneiden und ein klares Nutzenversprechen testen.',
      'Ich suche nach dem riskantesten Teil der Idee und mache daraus einen Ein-Tages-Test.',
      'Ich trenne schöne Vision von belastbarem Nachfrage-Signal.',
      'Ich frage, welcher konkrete Schmerz stark genug ist, damit Nutzer wechseln.',
      'Ich würde vor dem Produkt eine einfache Zusage, Warteliste oder Vorbestellung messen.',
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
  };
  const options = moves[intentLabel] ?? [
    'Ich kläre Ziel, Kontext, Engpass und den kleinsten nächsten Test.',
    'Ich suche nach der Annahme, die für die Entscheidung am wichtigsten ist.',
    'Ich trenne Wunsch, Risiko und überprüfbare Signale.',
  ];
  const seed = `${twin.id}|${twin.name}|${intentLabel}|${twin.style}|${(twin.categories ?? []).join('|')}`;
  return options[hashText(seed) % options.length] ?? options[0];
}

function fallbackKnowledgeLine(intentLabel: string, shortQuestion: string): string {
  return `Zur ${intentLabel} "${shortQuestion}" nutze ich Profil, Stil und Kategorien als historische Linse.`;
}

export function ruleBasedTwinReply(input: string, twin: TwinRecord): string {
  const trimmed = input.trim();
  const shortQuestion = trimmed.length > 150 ? `${trimmed.slice(0, 150)}...` : trimmed;
  const intent = questionIntent(trimmed);
  const style = styleLens(twin.style);
  const matches = relevantKnowledge(trimmed, twin);
  const hasKnowledge = matches.length > 0;

  if (!twin.knowledgeTexts.length && !twin.description) {
    return [
      `${stylePrefix(twin.style)} ${intent.label}: Ich antworte als ${twin.name}, ${style.voice}.`,
      `Meine erste Aussage: ${intentMove(twin, intent.label)}`,
      `${style.close}: ${intent.action}; ${intent.caution}.`,
      'Sobald Beschreibung, Wissen oder Medien hinterlegt sind, wird meine Antwort deutlich profilgenauer.',
    ].join(' ');
  }

  const role = twin.mainCategory ?? twin.categories?.[0] ?? 'KI-Profil';
  const knowledgeNote = hasKnowledge
    ? `Ich nutze meine hinterlegte Profilgrundlage als ${role}.`
    : fallbackKnowledgeLine(intent.label, shortQuestion);
  return [
    `${stylePrefix(twin.style)} ${intent.label}: Ich antworte als ${twin.name}, ${role}; mein Stil ist ${twin.answerStyle ?? style.voice}.`,
    `Meine Linse: ${categoryLens(twin)}; ${signatureLens(twin)} ${knowledgeNote}`,
    `Mein direkter Impuls: ${intentMove(twin, intent.label)}`,
    `${style.close}: ${intent.action}; dabei ${intent.caution}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({
    ok: true,
    service: 'smyst-api',
    status: 'ready',
  });
}

async function handleAccountExport(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'profile:read')) return errorResponse('forbidden', 'Missing profile read permission', 403);

  const [twins, chats, userRecord] = await Promise.all([
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
    twins,
    chats,
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
  const [twins, chats] = await Promise.all([
    loadUserTwins(env, session.sub),
    loadUserChats(env, session.sub),
  ]);

  await Promise.all([
    ...chats.map((chat) => kv.delete(chatKey(session.sub, chat.id))),
    ...twins.map((twin) => kv.delete(twinKey(session.sub, twin.id))),
    ...twins.filter((twin) => twin.visibility === 'public').map((twin) => kv.delete(publicTwinKey(twin.slug))),
  ]);

  const sessionId = readCookie(request, SESSION_COOKIE);
  await Promise.all([
    kv.delete(chatIndexKey(session.sub)),
    kv.delete(twinIndexKey(session.sub)),
    env.SESSIONS.delete(`auth:user:${session.sub}`),
    sessionId ? env.SESSIONS.delete(`s:${sessionId}`) : Promise.resolve(),
  ]);

  return jsonResponse({
    ok: true,
    deleted: {
      chats: chats.length,
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

async function handleStartChat(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'chat:write')) return errorResponse('forbidden', 'Missing chat write permission', 403);

  let body: ChatStartRequest = {};
  const parsed = await readJsonBody<ChatStartRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  body = parsed.value;

  let twin: TwinRecord | null = null;
  let publicTwin: TwinRecord | null = null;
  if (typeof body.twinId === 'string' && body.twinId) {
    twin = await loadTwinForUser(env, session.sub, body.twinId);
    if (!twin) publicTwin = await loadPublicTwin(env, slugify(body.twinId));
    if (!twin && (!publicTwin || publicTwin.visibility !== 'public')) {
      return errorResponse('twin_not_found', 'Twin not found', 404);
    }
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
    createdAt: now,
    updatedAt: now,
  };
  await putChat(env, chat);
  await addChatToIndex(env, session.sub, chat.id);

  return jsonResponse({ chat });
}

async function handleListChats(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'chat:read')) return errorResponse('forbidden', 'Missing chat read permission', 403);

  const kv = metadataStore(env);
  const ids = await getJson<string[]>(kv, chatIndexKey(session.sub), []);
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
  const ids = await getJson<string[]>(kv, twinIndexKey(session.sub), []);
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

async function handleChatMessage(request: Request, env: ApiEnv): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return errorResponse('unauthorized', 'Unauthorized', 401);
  if (!hasPermission(session, 'chat:write')) return errorResponse('forbidden', 'Missing chat write permission', 403);

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

  const kv = metadataStore(env);
  const chat = (await kv.get(chatKey(session.sub, body.chatId), 'json')) as ChatRecord | null;
  if (!chat) return errorResponse('chat_not_found', 'Chat not found', 404);
  const twin = chat.twinId
    ? await loadTwinForUser(env, session.sub, chat.twinId)
    : chat.publicTwinSlug
      ? await loadPublicTwin(env, chat.publicTwinSlug)
      : null;

  const now = Date.now();
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
      ? ruleBasedTwinReply(message, twin)
      : freeOnlyReply(message),
    createdAt: now,
  };

  const next: ChatRecord = {
    ...chat,
    messages: [...chat.messages, userMessage, assistantMessage].slice(-MAX_CHAT_MESSAGES),
    updatedAt: now,
  };
  await putChat(env, next);
  await addChatToIndex(env, session.sub, next.id);

  return jsonResponse({
    chatId: next.id,
    message: assistantMessage,
    twinId: chat.twinId ?? chat.publicTwinSlug ?? null,
    mode: twin ? 'free-only-twin-mvp' : 'free-only-static',
  });
}

export default {
  async fetch(request: Request, env: ApiEnv): Promise<Response> {
    return safeHandler(async () => {
      const url = new URL(request.url);
      const kv = metadataStore(env);

      if (request.method === 'OPTIONS') {
        return strictCorsPreflight(request, env.CANONICAL_HOST, 'GET, POST, PATCH, DELETE');
      }

      const csrf = requireSameOrigin(request, env.CANONICAL_HOST);
      if (csrf) {
        return csrf;
      }

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return handleHealth();
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
        return handleStartChat(request, env);
      }

      if (url.pathname === '/api/chat/messages' && request.method === 'POST') {
        const limited = await requireRateLimit(kv, {
          key: clientKey(request, 'api:chat-message'),
          limit: 60,
          windowSeconds: 60,
        });
        if (limited) return limited;
        return handleChatMessage(request, env);
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
