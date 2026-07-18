// Anzeige-Helfer fuer das 4-zeilige oeffentliche Profilformat:
//   Zeile 1: Name – Alter (z. B. "Albert Einstein – 76 Jahre")
//   Zeile 2: Geburtsdatum, Geburtsort
//   Zeile 3: Sterbedatum, Sterbeort
//   Zeile 4: Beruf (profileMainCategory, bleibt in App.tsx)
// Orte kommen aus LIFE_PLACES (Wikidata-verifiziert, statisch pro Slug).
import { LIFE_PLACES } from './life-places'

type LifeDisplayProfile = {
  name: string
  profileSlug?: string
  slug?: string
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
}

function formatIsoDate(value?: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function ageAtDeath(profile: LifeDisplayProfile): number | null {
  if (
    profile.birthDate &&
    profile.deathDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(profile.deathDate)
    ) {
    const [birthYear, birthMonth, birthDay] = profile.birthDate.split('-').map(Number)
    const [deathYear, deathMonth, deathDay] = profile.deathDate.split('-').map(Number)
    let age = deathYear - birthYear
    if (deathMonth < birthMonth || (deathMonth === birthMonth && deathDay < birthDay)) age -= 1
    return age >= 0 ? age : null
  }
  if (typeof profile.birthYear === 'number' && typeof profile.deathYear === 'number') {
    const age = profile.deathYear - profile.birthYear
    return age >= 0 ? age : null
  }
  return null
}

function lifePlaceSlug(profile: LifeDisplayProfile): string {
  return profile.profileSlug ?? profile.slug ?? ''
}

// Zeile 1: "Name – 76 Jahre" (ohne Alter nur Name).
export function profileNameWithAge(profile: LifeDisplayProfile): string {
  const age = ageAtDeath(profile)
  return age !== null ? `${profile.name} – ${age} Jahre` : profile.name
}

// Zeile 2: "Geburtsdatum, Geburtsort" (fehlender Teil wird weggelassen).
export function profileBirthLine(profile: LifeDisplayProfile): string {
  const date = profile.birthLabel || formatIsoDate(profile.birthDate) || ''
  const place = LIFE_PLACES[lifePlaceSlug(profile)]?.birthPlace || ''
  return [date, place].filter(Boolean).join(', ')
}

// Zeile 3: "Sterbedatum, Sterbeort" (fehlender Teil wird weggelassen).
export function profileDeathLine(profile: LifeDisplayProfile): string {
  const date = profile.deathLabel || formatIsoDate(profile.deathDate) || ''
  const place = LIFE_PLACES[lifePlaceSlug(profile)]?.deathPlace || ''
  return [date, place].filter(Boolean).join(', ')
}
