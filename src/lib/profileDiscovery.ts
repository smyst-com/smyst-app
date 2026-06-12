export type DiscoverySortMode = 'famous' | 'used' | 'popular' | 'trend' | 'manual'

export interface DiscoveryProfile {
  id: string
  name: string
  description: string
  role: string
  tone: string
  categories: string[]
  languages: string[]
  createdAt: number
  updatedAt: number
  manualRank: number
  knowledgeCount: number
  mediaCount: number
  chatCount: number
  lastChatAt: number
  publicProfile: boolean
}

export interface DiscoveryCategory {
  name: string
  count: number
}

export function normalizeDiscoveryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalizeDiscoveryText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    let rowMin = current[0]
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      )
      rowMin = Math.min(rowMin, current[j])
    }
    if (rowMin > maxDistance) return false
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }

  return previous[b.length] <= maxDistance
}

function fuzzyTokenScore(queryToken: string, candidateToken: string): number {
  if (!queryToken || !candidateToken) return 0
  if (candidateToken === queryToken) return 80
  if (candidateToken.startsWith(queryToken)) return 56
  if (candidateToken.includes(queryToken)) return 42
  const maxDistance = queryToken.length >= 7 ? 2 : 1
  return editDistanceWithin(queryToken, candidateToken, maxDistance) ? 26 : 0
}

export function profileSearchScore(profile: DiscoveryProfile, query: string): number {
  const queryTokens = tokens(query)
  if (!queryTokens.length) return 1

  const candidateFields = [
    profile.name,
    profile.description,
    profile.role,
    profile.tone,
    profile.categories.join(' '),
    profile.languages.join(' '),
  ]
  const candidateTokens = tokens(candidateFields.join(' '))
  if (!candidateTokens.length) return 0

  let score = 0
  for (const queryToken of queryTokens) {
    let best = 0
    for (const candidateToken of candidateTokens) {
      best = Math.max(best, fuzzyTokenScore(queryToken, candidateToken))
      if (best >= 80) break
    }
    if (!best) return 0
    score += best
  }

  const normalizedQuery = normalizeDiscoveryText(query)
  const normalizedName = normalizeDiscoveryText(profile.name)
  const normalizedDescription = normalizeDiscoveryText(profile.description)
  if (normalizedName.includes(normalizedQuery)) score += 120
  if (normalizedDescription.includes(normalizedQuery)) score += 32
  return score
}

export function profileQualityScore(profile: DiscoveryProfile, now = Date.now()): number {
  const ageDays = Math.max(0, (now - profile.createdAt) / 86_400_000)
  const recencyDays = Math.max(0, (now - profile.updatedAt) / 86_400_000)
  const lastChatDays = profile.lastChatAt ? Math.max(0, (now - profile.lastChatAt) / 86_400_000) : 999
  return (
    (profile.publicProfile ? 80 : 20) +
    Math.min(profile.chatCount, 50) * 12 +
    Math.min(profile.knowledgeCount, 40) * 4 +
    Math.min(profile.mediaCount, 24) * 2 +
    Math.max(0, 80 - recencyDays) +
    Math.max(0, 45 - lastChatDays * 3) +
    (ageDays <= 14 ? 35 : 0)
  )
}

export function isNewProfile(profile: DiscoveryProfile, now = Date.now()): boolean {
  return now - profile.createdAt <= 14 * 86_400_000
}

export function isPopularProfile(profile: DiscoveryProfile): boolean {
  return profile.chatCount >= 3 || profile.knowledgeCount + profile.mediaCount >= 6
}

export function rankProfiles(
  profiles: DiscoveryProfile[],
  query: string,
  sortMode: DiscoverySortMode,
  now = Date.now(),
): DiscoveryProfile[] {
  const normalizedQuery = query.trim()
  return profiles
    .map((profile) => ({
      profile,
      searchScore: profileSearchScore(profile, normalizedQuery),
      qualityScore: profileQualityScore(profile, now),
    }))
    .filter((item) => !normalizedQuery || item.searchScore > 0)
    .sort((a, b) => {
      if (normalizedQuery && b.searchScore !== a.searchScore) return b.searchScore - a.searchScore
      if (sortMode === 'used') return b.profile.lastChatAt - a.profile.lastChatAt || b.profile.chatCount - a.profile.chatCount
      if (sortMode === 'popular') return b.profile.chatCount - a.profile.chatCount || b.qualityScore - a.qualityScore
      if (sortMode === 'trend') return b.profile.createdAt - a.profile.createdAt || b.profile.updatedAt - a.profile.updatedAt
      if (sortMode === 'manual') return a.profile.manualRank - b.profile.manualRank
      return b.qualityScore - a.qualityScore || b.profile.updatedAt - a.profile.updatedAt
    })
    .map((item) => item.profile)
}

export function categoryFacets(profiles: DiscoveryProfile[], limit = 8): DiscoveryCategory[] {
  const counts = new Map<string, number>()
  for (const profile of profiles) {
    for (const category of profile.categories) {
      const clean = category.trim()
      if (!clean) continue
      counts.set(clean, (counts.get(clean) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'))
    .slice(0, limit)
}

export function similarProfiles(
  active: DiscoveryProfile | null,
  profiles: DiscoveryProfile[],
  limit = 6,
): DiscoveryProfile[] {
  if (!active) return []
  const activeCategories = new Set(active.categories.map(normalizeDiscoveryText))
  const activeLanguages = new Set(active.languages.map(normalizeDiscoveryText))
  return profiles
    .filter((profile) => profile.id !== active.id)
    .map((profile) => {
      const categoryScore = profile.categories.reduce(
        (sum, category) => sum + (activeCategories.has(normalizeDiscoveryText(category)) ? 5 : 0),
        0,
      )
      const languageScore = profile.languages.reduce(
        (sum, language) => sum + (activeLanguages.has(normalizeDiscoveryText(language)) ? 2 : 0),
        0,
      )
      const styleScore = profile.tone === active.tone ? 2 : 0
      return { profile, score: categoryScore + languageScore + styleScore + profileQualityScore(profile) / 100 }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.name.localeCompare(b.profile.name, 'de'))
    .slice(0, limit)
    .map((item) => item.profile)
}

export function recommendedProfiles(profiles: DiscoveryProfile[], limit = 8): DiscoveryProfile[] {
  return rankProfiles(profiles, '', 'famous').slice(0, limit)
}

export function popularProfiles(profiles: DiscoveryProfile[], limit = 8): DiscoveryProfile[] {
  return rankProfiles(profiles.filter(isPopularProfile), '', 'popular').slice(0, limit)
}

export function newProfiles(profiles: DiscoveryProfile[], limit = 8, now = Date.now()): DiscoveryProfile[] {
  return profiles
    .filter((profile) => isNewProfile(profile, now))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

export function recentlyUsedProfiles(profiles: DiscoveryProfile[], limit = 8): DiscoveryProfile[] {
  return profiles
    .filter((profile) => profile.lastChatAt > 0)
    .sort((a, b) => b.lastChatAt - a.lastChatAt)
    .slice(0, limit)
}
