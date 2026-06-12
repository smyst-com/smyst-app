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
} from './_shared';

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
  sources?: Array<{ title: string; publisher: string; url: string }>;
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

const historicalDemoProfiles = [
  {
    id: 'leonardo-da-vinci',
    slug: 'leonardo-da-vinci',
    name: 'Leonardo da Vinci',
    field: 'Renaissance art and engineering',
    region: 'Italy / France',
    years: '1452-1519',
    description:
      'Source-grounded historical demo profile focused on public facts about art, engineering studies, notebooks, and Renaissance context.',
    contextSummary:
      'Historical public-knowledge profile. Answers must be based on public sources, distinguish known facts from interpretation, and never claim to be the real person.',
    guardrail:
      'This is a historically inspired public-knowledge profile, not Leonardo da Vinci and not affiliated with any estate, museum, archive, or institution.',
    rightsPosture:
      'Long deceased. Use original smyst copy and only licensed, open-access, or public-domain-safe imagery.',
    sources: [
      {
        title: 'Leonardo da Vinci',
        publisher: 'Encyclopaedia Britannica',
        url: 'https://www.britannica.com/biography/Leonardo-da-Vinci',
      },
      {
        title: 'Leonardo da Vinci (1452-1519)',
        publisher: 'The Metropolitan Museum of Art',
        url: 'https://www.metmuseum.org/essays/leonardo-da-vinci-1452-1519',
      },
    ],
  },
  {
    id: 'isaac-newton',
    slug: 'isaac-newton',
    name: 'Isaac Newton',
    field: 'Physics and mathematics',
    region: 'England',
    years: '1642-1727',
    description:
      'Source-grounded historical demo profile focused on mechanics, gravity, optics, calculus, and the Scientific Revolution.',
    contextSummary:
      'Historical public-knowledge profile. Treat priority disputes and scientific history carefully instead of presenting disputed claims as personal testimony.',
    guardrail:
      'This is a historically inspired public-knowledge profile, not Isaac Newton and not affiliated with any estate, archive, university, or institution.',
    rightsPosture:
      'Long deceased. Avoid modern book scans, portraits, editions, annotations, and commentary unless rights are verified.',
    sources: [
      {
        title: 'Isaac Newton',
        publisher: 'Encyclopaedia Britannica',
        url: 'https://www.britannica.com/biography/Isaac-Newton',
      },
      {
        title: 'Sir Isaac Newton',
        publisher: 'The Royal Society',
        url: 'https://royalsociety.org/people/isaac-newton-11991/',
      },
    ],
  },
  {
    id: 'william-shakespeare',
    slug: 'william-shakespeare',
    name: 'William Shakespeare',
    field: 'Literature and theatre',
    region: 'England',
    years: '1564-1616',
    description:
      'Source-grounded historical demo profile focused on plays, poems, Elizabethan theatre, and long-term cultural influence.',
    contextSummary:
      'Historical public-knowledge profile. Distinguish documented biography from later traditions, adaptations, authorship theories, and modern interpretation.',
    guardrail:
      'This is a historically inspired public-knowledge profile, not William Shakespeare and not affiliated with any trust, theatre, publisher, estate, or institution.',
    rightsPosture:
      'Long deceased. Public-domain works may be usable, but modern annotations, translations, performances, recordings, and editions need review.',
    sources: [
      {
        title: 'William Shakespeare',
        publisher: 'Encyclopaedia Britannica',
        url: 'https://www.britannica.com/biography/William-Shakespeare',
      },
      {
        title: "Shakespeare's life",
        publisher: 'Shakespeare Birthplace Trust',
        url: 'https://www.shakespeare.org.uk/explore-shakespeare/shakespedia/william-shakespeare/shakespeares-life/',
      },
    ],
  },
  {
    id: 'aristotle',
    slug: 'aristotle',
    name: 'Aristotle',
    field: 'Philosophy and science',
    region: 'Ancient Greece',
    years: '384-322 BCE',
    description:
      'Source-grounded historical demo profile focused on logic, ethics, politics, biology, rhetoric, and ancient Greek philosophy.',
    contextSummary:
      'Historical public-knowledge profile. Separate surviving ancient material, later school traditions, and modern scholarly interpretation.',
    guardrail:
      'This is a historically inspired public-knowledge profile, not Aristotle and not affiliated with any archive, publisher, university, or institution.',
    rightsPosture:
      'Ancient figure. Avoid copying modern translations, introductions, and commentary without rights clearance.',
    sources: [
      {
        title: 'Aristotle',
        publisher: 'Encyclopaedia Britannica',
        url: 'https://www.britannica.com/biography/Aristotle',
      },
      {
        title: 'Aristotle',
        publisher: 'Stanford Encyclopedia of Philosophy',
        url: 'https://plato.stanford.edu/entries/aristotle/',
      },
    ],
  },
  {
    id: 'sun-tzu',
    slug: 'sun-tzu',
    name: 'Sun Tzu',
    field: 'Strategy and military thought',
    region: 'Ancient China',
    years: 'traditional attribution',
    description:
      'Source-grounded historical demo profile focused on the historical tradition around The Art of War and its influence on strategy.',
    contextSummary:
      'Historical public-knowledge profile. Distinguish historically attested information from later tradition, legend, and modern management interpretation.',
    guardrail:
      'This is a historically inspired public-knowledge profile, not Sun Tzu and not affiliated with any archive, publisher, university, or institution.',
    rightsPosture:
      'Ancient figure. Avoid copying modern translations of The Art of War unless their rights status is verified.',
    sources: [
      {
        title: 'Sunzi',
        publisher: 'Encyclopaedia Britannica',
        url: 'https://www.britannica.com/biography/Sunzi',
      },
      {
        title: 'Sunzi',
        publisher: 'Internet Encyclopedia of Philosophy',
        url: 'https://iep.utm.edu/sunzi/',
      },
    ],
  },
] as const;

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
  return (await metadataStore(env).get(publicTwinKey(slug), 'json')) as TwinRecord | null;
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
    if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/public/')) return null;
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
  const mediaKinds = Array.from(new Set(mediaRefs.map((item) => item.category))).join(', ') || 'keine Medienreferenzen';
  const summary = [
    `${twin.name} ist ein digitaler Free-only-KI-Zwilling.`,
    twin.description ? `Profil: ${twin.description}` : 'Profil: noch kurz.',
    categories.length ? `Kategorien: ${categories.join(', ')}.` : '',
    languages.length ? `Sprachen: ${languages.join(', ')}.` : '',
    `Kommunikationsstil: ${twin.style}.`,
    `Wissensbasis: ${knowledge || 'noch keine Wissenstexte gespeichert.'}`,
    `IDrive-e2-Referenzen: ${mediaKinds}.`,
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

async function syncPublicTwin(env: ApiEnv, next: TwinRecord, previous?: TwinRecord | null): Promise<void> {
  const kv = metadataStore(env);
  if (previous?.slug && (previous.slug !== next.slug || next.visibility !== 'public')) {
    await kv.delete(publicTwinKey(previous.slug));
  }
  if (next.visibility === 'public') {
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
    chatPath: `/twin-chat?twin=${encodeURIComponent(twin.id)}`,
    uploadedContents: uploadedContentSummary(twin),
    mediaCount: (twin.mediaRefs ?? []).length,
    knowledgeCount: (twin.knowledgeTexts ?? []).length,
    contextSummary: twin.contextSummary,
    guardrail: twin.guardrail,
    rightsPosture: twin.rightsPosture,
    sources: twin.sources ?? [],
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

function historicalDemoPayload(env: ApiEnv, slug: string) {
  const profile = historicalDemoProfiles.find((item) => item.slug === slug || item.id === slug);
  if (!profile) return null;
  const host = (env.CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
  const url = `${host}/t/${profile.slug}`;
  return {
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    description: `${profile.description} ${profile.guardrail}`,
    imageUrl: null,
    categories: ['Historical demo', profile.field, profile.region],
    languages: ['de', 'en'],
    visibility: 'public' as const,
    style: 'neutral' as const,
    status: 'ready' as const,
    url,
    chatPath: `/twin-chat?twin=${encodeURIComponent(profile.id)}`,
    uploadedContents: [{ category: 'public-source-note', count: profile.sources.length }],
    mediaCount: 0,
    knowledgeCount: profile.sources.length,
    contextSummary: profile.contextSummary,
    guardrail: profile.guardrail,
    rightsPosture: profile.rightsPosture,
    sources: profile.sources,
    updatedAt: 1781222400000,
    seo: {
      title: `${profile.name} | Historical Demo Twin | smyst.com`,
      description: `${profile.name} historical public-knowledge profile on smyst.com. Not official, not affiliated, sources required.`,
      canonical: url,
      robots: 'index,follow',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `${profile.name} | smyst.com`,
        description: profile.description,
        url,
        about: {
          '@type': 'Person',
          name: profile.name,
          description: `${profile.field}. ${profile.years}.`,
        },
        isBasedOn: profile.sources.map((source) => ({
          '@type': 'CreativeWork',
          name: source.title,
          publisher: source.publisher,
          url: source.url,
        })),
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

function ruleBasedTwinReply(input: string, twin: TwinRecord): string {
  const trimmed = input.trim();
  const shortQuestion = trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
  const matches = relevantKnowledge(trimmed, twin);
  const snippets = matches
    .map((item) => {
      const title = item.title ? `${item.title}: ` : '';
      return `${title}${item.text.slice(0, 320)}`;
    })
    .join(' ');

  if (!twin.knowledgeTexts.length && !twin.description) {
    return [
      `Ich bin ${twin.name}, aktuell als Free-only-MVP-Zwilling.`,
      `Zu deiner Frage "${shortQuestion}" kann ich noch nur allgemein antworten, weil noch keine Wissenstexte hinterlegt sind.`,
      'Lade Texte, Dokumente oder Medien hoch, dann kann mein Kontext gezielter werden.',
    ].join(' ');
  }

  return [
    `${stylePrefix(twin.style)} Ich antworte als ${twin.name}.`,
    twin.description ? `Mein gespeichertes Profil sagt: ${twin.description.slice(0, 260)}.` : '',
    snippets ? `Passende Erinnerungen/Wissen: ${snippets}` : `Zu "${shortQuestion}" finde ich noch keinen direkten Treffer in meiner Wissensbasis.`,
    'Diese Antwort ist regelbasiert und nutzt nur Cloudflare KV Metadaten sowie IDrive-e2-Referenzen, keine bezahlte externe KI.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({
    ok: true,
    service: 'smyst-api',
    mode: 'free-only',
    storage: 'idrive-e2',
    metadata: 'cloudflare-kv',
    twinMvp: 'rule-based',
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
  if (typeof body.twinId === 'string' && body.twinId) {
    twin = await loadTwinForUser(env, session.sub, body.twinId);
    if (!twin) return errorResponse('twin_not_found', 'Twin not found', 404);
  }

  const now = Date.now();
  const chat: ChatRecord = {
    id: crypto.randomUUID(),
    userSub: session.sub,
    title: twin ? `Chat mit ${twin.name}` : 'Free-only chat',
    twinId: twin?.id,
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
    'Smyst free-only Antwort:',
    `Ich habe deine Nachricht erhalten: "${short}"`,
    'In dieser Phase nutze ich keine bezahlten KI-Provider und keine externen Modell-APIs.',
    'Sobald echte Twin-Verarbeitung erlaubt ist, muss sie weiterhin Auth, Quotas, Datenschutz und IDrive-e2-Speicherregeln beachten.',
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
  const demoTwin = !twin ? historicalDemoPayload(env, cleanSlug) : null;
  if ((!twin || twin.visibility !== 'public') && !demoTwin) {
    return errorResponse('public_twin_not_found', 'Public twin not found', 404);
  }

  const limited = await requireRateLimit(metadataStore(env), {
    key: clientKey(request, 'api:public-twin'),
    limit: 240,
    windowSeconds: 60,
  });
  if (limited) return limited;

  return jsonResponse({ twin: twin ? publicTwinPayload(env, twin) : demoTwin }, 200, {
    'cache-control': 'public, max-age=120, s-maxage=600',
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
  const twin = chat.twinId ? await loadTwinForUser(env, session.sub, chat.twinId) : null;

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
    content: twin ? ruleBasedTwinReply(message, twin) : freeOnlyReply(message),
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
    twinId: twin?.id ?? null,
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
