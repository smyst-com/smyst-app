#!/usr/bin/env node
// Guard: verify:free-stack:live-dns
// Prueft live per DNS-over-HTTPS (dns.google), dass der kostenlose
// Mail-Stack fuer smyst.com intakt ist. Kein Paid-Mail-Provider,
// kein fremder MX/SPF ausser Gmail + Spaceship-Forwarding (efwd).
//
// Hard-Mode: SMYST_MAIL_RECEIVE_REQUIRED=1
//   -> Empfang (MX efwd.spaceship.net) muss vorhanden sein, sonst rot.
// Ohne Hard-Mode ist fehlender Empfang nur ein Hinweis.

const DOMAIN = 'smyst.com'
const DOH = 'https://dns.google/resolve'

// Erlaubte Mail-Infrastruktur (kostenlos):
const ALLOWED_SPF_INCLUDES = new Set([
  '_spf.google.com', // Gmail (Senden als s@)
  'spf.efwd.spaceship.net', // Spaceship Email Forwarding (Empfang, dauerhaft gratis)
])
const ALLOWED_MX_SUFFIX = '.efwd.spaceship.net' // nur Registrar-Forwarding
const PAID_MAIL_MARKERS = [
  'spacemail', 'zoho', 'protonmail', 'outlook.com', 'office365',
  'mailgun', 'sendgrid', 'mailjet', 'fastmail', 'mimecast', 'barracuda',
  'pphosted', 'mailbox.org', 'ionos', 'ovh', 'yandex',
]

let failures = 0
let hints = 0
const ok = (m) => console.log(`  OK   ${m}`)
const bad = (m) => { failures += 1; console.error(`  FAIL ${m}`) }
const hint = (m) => { hints += 1; console.warn(`  HINW ${m}`) }

async function resolve(name, type) {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}&cd=1`)
  if (!res.ok) throw new Error(`DoH ${type} ${name}: HTTP ${res.status}`)
  const data = await res.json()
  return (data.Answer ?? []).filter((a) => a.name.replace(/\.$/, '') === name)
}

const stripQuotes = (s) => s.replace(/^"|"$/g, '').replace(/" "/g, '')

async function main() {
  console.log(`Guard verify:free-stack:live-dns fuer ${DOMAIN}`)
  const receiveRequired = process.env.SMYST_MAIL_RECEIVE_REQUIRED === '1'
  if (receiveRequired) console.log('  Modus: HART (Empfang muss funktionieren)')

  // 1) DNS erreichbar
  let txt
  try {
    txt = await resolve(DOMAIN, 'TXT')
    ok('DNS (DoH dns.google) erreichbar')
  } catch (err) {
    bad(`DNS nicht erreichbar: ${err.message}`)
    process.exit(1)
  }

  // 2) SPF: genau EIN Record, enthaelt Gmail, nur erlaubte includes
  const spfRecords = txt.map((a) => stripQuotes(a.data)).filter((d) => d.toLowerCase().startsWith('v=spf1'))
  if (spfRecords.length === 0) bad('Kein SPF-Record auf @ gefunden')
  else if (spfRecords.length > 1) bad(`Doppelter SPF-Eintrag (${spfRecords.length} Records) — RFC-Verstoss`)
  else {
    const spf = spfRecords[0]
    ok(`SPF vorhanden: ${spf}`)
    if (!spf.includes('include:_spf.google.com')) bad('SPF ohne include:_spf.google.com (Gmail-Versand nicht abgedeckt)')
    else ok('SPF deckt Gmail ab (include:_spf.google.com)')
    const includes = [...spf.matchAll(/include:([^\s]+)/g)].map((m) => m[1].toLowerCase())
    const foreign = includes.filter((i) => !ALLOWED_SPF_INCLUDES.has(i))
    if (foreign.length) bad(`Fremde SPF-includes: ${foreign.join(', ')}`)
    else ok('Keine fremden SPF-includes')
    if (!/[~-]all$/.test(spf.trim())) hint('SPF endet nicht mit ~all/-all')
  }

  // 3) DMARC vorhanden (Monitoring)
  const dmarcAns = await resolve(`_dmarc.${DOMAIN}`, 'TXT')
  const dmarc = dmarcAns.map((a) => stripQuotes(a.data)).find((d) => d.toLowerCase().startsWith('v=dmarc1'))
  if (!dmarc) bad('Kein DMARC-Record auf _dmarc gefunden')
  else {
    ok(`DMARC vorhanden: ${dmarc}`)
    if (!/p=none|p=quarantine|p=reject/.test(dmarc)) bad('DMARC ohne Policy (p=)')
    if (!/rua=mailto:/.test(dmarc)) hint('DMARC ohne rua= (kein Monitoring-Report)')
    else ok('DMARC-Monitoring aktiv (rua=)')
  }

  // 4) MX: nur Spaceship-Forwarding erlaubt
  const mxAns = await resolve(DOMAIN, 'MX')
  const mxHosts = mxAns.map((a) => a.data.split(/\s+/).pop().replace(/\.$/, '').toLowerCase())
  if (mxHosts.length === 0) {
    if (receiveRequired) bad('Kein MX — Empfang fuer s@smyst.com funktioniert nicht (Hard-Mode)')
    else hint('Kein MX — Empfang fuer s@smyst.com aktuell nicht moeglich')
  } else {
    const foreignMx = mxHosts.filter((h) => !h.endsWith(ALLOWED_MX_SUFFIX))
    if (foreignMx.length) bad(`Fremder MX gefunden: ${foreignMx.join(', ')} (erlaubt nur *${ALLOWED_MX_SUFFIX})`)
    else ok(`MX = Spaceship-Forwarding: ${mxHosts.join(', ')} (Empfang aktiv)`)
  }

  // 5) Keine Paid-Mail-Infrastruktur in MX/TXT
  const haystack = [...mxHosts, ...txt.map((a) => stripQuotes(a.data).toLowerCase())].join(' ')
  const paidHits = PAID_MAIL_MARKERS.filter((m) => haystack.includes(m))
  if (paidHits.length) bad(`Hinweis auf Paid-Mail-Infrastruktur: ${paidHits.join(', ')}`)
  else ok('Keine Paid-Mail-Infrastruktur in DNS erkennbar')

  console.log('')
  if (failures > 0) {
    console.error(`ERGEBNIS: ROT — ${failures} Fehler, ${hints} Hinweise`)
    process.exit(1)
  }
  console.log(`ERGEBNIS: GRUEN — 0 Fehler, ${hints} Hinweise`)
}

main().catch((err) => {
  console.error(`Guard abgebrochen: ${err.message}`)
  process.exit(1)
})
