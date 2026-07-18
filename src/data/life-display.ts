// Anzeige-Helfer fuer das 4-zeilige oeffentliche Profilformat:
//   Zeile 1: Name – Alter (z. B. "Albert Einstein – 76 Jahre")
//   Zeile 2: Geburtsdatum, Geburtsort
//   Zeile 3: Sterbedatum, Sterbeort
//   Zeile 4: Beruf (profileMainCategory, bleibt in App.tsx)
// Orte kommen bevorzugt aus dem Profil selbst (die Autopilot-Pipeline liefert
// birthPlace/deathPlace aus Wikidata P19/P20 mit). Fehlen sie — etwa bei den
// kuratierten Profilen —, greift LIFE_PLACES als statischer Fallback pro Slug.
import { LIFE_PLACES } from './life-places'

type LifeDisplayProfile = {
  name: string
  lifeSlug?: string
  profileSlug?: string
  slug?: string
  birthDate?: string
  deathDate?: string
  birthYear?: number
  deathYear?: number
  birthLabel?: string
  deathLabel?: string
  birthPlace?: string
  deathPlace?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function formatIsoDate(value?: string): string | null {
  if (!value || !ISO_DATE.test(value)) return null
  const [year, month, day] = value.split('-')
  // Jahre unter 1000 kommen aus Wikidata nullgepolstert ("0014-08-19").
  // Ungefiltert stand auf der Seite "19.08.0014"; ohne Polsterung waere "19.08.14"
  // mit 1914 verwechselbar. Darum Jahr entpolstern und als n. Chr. ausweisen.
  const yearNumber = Number(year)
  if (yearNumber < 1000) return `${day}.${month}.${yearNumber} n. Chr.`
  return `${day}.${month}.${year}`
}

// Manche Profile liefern in birthLabel/deathLabel ein rohes ISO-Datum
// (z. B. "1887-12-22") statt eines Anzeigetexts. Solche Labels werden
// formatiert; echte Labels wie "ca. 384 v. Chr." bleiben unveraendert.
function displayDate(label?: string, isoDate?: string): string {
  if (label && !ISO_DATE.test(label)) return label
  return formatIsoDate(label) || formatIsoDate(isoDate) || ''
}

function ageAtDeath(profile: LifeDisplayProfile): number | null {
  if (
    profile.birthDate &&
    profile.deathDate &&
    ISO_DATE.test(profile.birthDate) &&
    ISO_DATE.test(profile.deathDate)
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
  return profile.lifeSlug ?? profile.profileSlug ?? profile.slug ?? ''
}

// Zeile 1: "Name – 76 Jahre" (ohne Alter nur Name).
export function profileNameWithAge(profile: LifeDisplayProfile): string {
  const age = ageAtDeath(profile)
  return age !== null ? `${profile.name} – ${age} Jahre` : profile.name
}

// Zeile 2: "Geburtsdatum, Geburtsort" (fehlender Teil wird weggelassen).
export function profileBirthLine(profile: LifeDisplayProfile): string {
  const date = displayDate(profile.birthLabel, profile.birthDate)
  const place = profile.birthPlace?.trim() || LIFE_PLACES[lifePlaceSlug(profile)]?.birthPlace || ''
  return [date, place].filter(Boolean).join(', ')
}

// Zeile 3: "Sterbedatum, Sterbeort" (fehlender Teil wird weggelassen).
export function profileDeathLine(profile: LifeDisplayProfile): string {
  const date = displayDate(profile.deathLabel, profile.deathDate)
  const place = profile.deathPlace?.trim() || LIFE_PLACES[lifePlaceSlug(profile)]?.deathPlace || ''
  return [date, place].filter(Boolean).join(', ')
}
