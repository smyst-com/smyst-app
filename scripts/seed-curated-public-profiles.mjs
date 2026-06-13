import { readFile } from 'node:fs/promises';

const accountId = '477794df69f0b6a0b9e4c59e36883c1f';
const metadataNamespaceId = '24a718c1c31248779add893b93fd4152';
const tokenFile = process.env.SMYST_CF_TOKEN_FILE || '/private/tmp/smyst_cf_token';
const canonicalHost = (process.env.SMYST_CANONICAL_HOST || 'https://smyst.com').replace(/\/$/, '');
const token = (await readFile(tokenFile, 'utf8')).trim();
const now = Date.now();
const ttlSeconds = 60 * 60 * 24 * 370;

const leonardo = {
  id: 'curated-leonardo-da-vinci',
  userSub: 'smyst-curated',
  name: 'Leonardo da Vinci',
  slug: 'leonardo-da-vinci',
  description:
    'Renaissance-Universalgelehrter, Erfinder, Künstler und Wissenschaftler mit Fokus auf Beobachtung, Anatomie, Mechanik, Natur, Kunst und visionäre Ideen.',
  imageUrl: `${canonicalHost}/public/profile-images/leonardo-da-vinci.png`,
  categories: ['Wissenschaft', 'Kunst', 'Erfindungen', 'Renaissance', 'Anatomie', 'Mechanik'],
  languages: ['de', 'en', 'tr', 'fr', 'es', 'pt', 'ar', 'zh', 'ja', 'ko'],
  visibility: 'public',
  style: 'wise',
  knowledgeTexts: [
    {
      id: 'knowledge-leonardo-core',
      title: 'Profilgrundlage',
      text:
        'Leonardo da Vinci war ein Renaissance-Universalgelehrter. Dieses KI-Profil antwortet analytisch, kreativ und visionär aus der Perspektive von Kunst, Wissenschaft, Erfindung, Anatomie, Naturbeobachtung und praktischer Experimentierfreude.',
      createdAt: now,
    },
  ],
  mediaRefs: [
    {
      id: 'media-leonardo-portrait',
      key: 'public/profile-images/leonardo-da-vinci.png',
      category: 'profile-image',
      contentType: 'image/png',
      filename: 'leonardo-da-vinci.png',
      size: 568813,
      createdAt: now,
    },
  ],
  contextSummary:
    'Leonardo da Vinci ist ein öffentliches digitales Twin-Profil auf smyst.com. Profil: Renaissance-Universalgelehrter, Erfinder, Künstler und Wissenschaftler mit Fokus auf Beobachtung, Anatomie, Mechanik, Natur, Kunst und visionäre Ideen. Kategorien: Wissenschaft, Kunst, Erfindungen, Renaissance, Anatomie, Mechanik. Sprachen: de, en, tr, fr, es, pt, ar, zh, ja, ko. Kommunikationsstil: wise. Antwortstil: analytisch, kreativ, visionär, beobachtend und praktisch experimentierend.',
  guardrail:
    'Antwortet als historisch inspiriertes KI-Profil. Es behauptet nicht, die echte verstorbene Person zu sein, und soll keine modernen Fakten erfinden.',
  rightsPosture:
    'Historisches, verstorbenes Profil. Profilbild: gemeinfreies Porträt von Leonardo da Vinci, Francesco Melzi zugeschrieben, Wikimedia Commons Public Domain Mark.',
  sources: [
    {
      title: 'Francesco Melzi - Portrait of Leonardo.png',
      publisher: 'Wikimedia Commons',
      url: 'https://commons.wikimedia.org/wiki/File:Francesco_Melzi_-_Portrait_of_Leonardo.png',
    },
    {
      title: 'Leonardo da Vinci',
      publisher: 'Encyclopaedia Britannica',
      url: 'https://www.britannica.com/biography/Leonardo-da-Vinci',
    },
  ],
  status: 'ready',
  createdAt: now,
  updatedAt: now,
};

const profiles = [leonardo];

async function cf(path, init = {}) {
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
    payload = { success: response.ok, raw: text };
  }
  if (!response.ok || payload.success === false) {
    throw new Error(`${init.method || 'GET'} ${path} failed ${response.status}: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result ?? payload;
}

async function kvGet(key, fallback = null) {
  const encodedKey = encodeURIComponent(key);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${metadataNamespaceId}/values/${encodedKey}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 404) return fallback;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET KV ${key} failed ${response.status}: ${text}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function kvPut(key, value) {
  const encodedKey = encodeURIComponent(key);
  await cf(
    `/accounts/${accountId}/storage/kv/namespaces/${metadataNamespaceId}/values/${encodedKey}?expiration_ttl=${ttlSeconds}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    },
  );
}

for (const profile of profiles) {
  await kvPut(`meta:twin:${profile.userSub}:${profile.id}`, profile);
  await kvPut(`public:twin:${profile.slug}`, { ...profile, userSub: 'public' });

  const indexKey = `meta:twins:${profile.userSub}`;
  const currentIndex = await kvGet(indexKey, []);
  const nextIndex = [profile.id, ...(Array.isArray(currentIndex) ? currentIndex : []).filter((id) => id !== profile.id)].slice(0, 50);
  await kvPut(indexKey, nextIndex);
}

const publicList = await fetch(`${canonicalHost}/api/public/twins`, {
  headers: { accept: 'application/json' },
});
const publicBody = await publicList.json();

console.log(
  JSON.stringify(
    {
      ok: true,
      seeded: profiles.map((profile) => ({
        name: profile.name,
        slug: profile.slug,
        visibility: profile.visibility,
        status: profile.status,
        imageUrl: profile.imageUrl,
      })),
      visibleProfiles: Array.isArray(publicBody.twins) ? publicBody.twins.map((profile) => profile.slug) : [],
    },
    null,
    2,
  ),
);
