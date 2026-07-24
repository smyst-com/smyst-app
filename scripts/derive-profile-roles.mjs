/**
 * smyst.com — Deterministische Rollen-/Kategorien-Ableitung fuer Pipeline-Profile.
 *
 * Problem (Befund 23.07.2026, PR #242): Ohne Eintrag in
 * scripts/pipeline-profile-corrections.json fallen neue Pipeline-Profile auf
 * den groben Ingest-Topf zurueck (Wikidata-Occupation-Bucket, z. B. wurde
 * US-Praesident Van Buren als "Literatur" angezeigt, weil er ueber die
 * writer-Occupation gefunden wurde).
 *
 * Loesung: Zeile 4 des Profilformats (mainCategory) und die Kategorien werden
 * aus der research-verifizierten Profilbeschreibung abgeleitet ("franzoesischer
 * Komponist und Musikkritiker" -> roles "Komponist, Musikkritiker",
 * categories ["Musik"]). Rein deterministisch (kein LLM, replaybar),
 * case-sensitiv mit Wortgrenzen-Pruefung, damit deutsche Komposita nicht
 * fehlmatchen ("Staatsphilosoph" matcht NICHT "Philosoph", da kleines p).
 *
 * Vorrang bleibt unveraendert: Korrektur-Datei > Ableitung > Ingest-Topf.
 * Kuratierte Eintraege werden also niemals ueberschrieben.
 */

/** Rollen-Nomen -> Kategorien. Reihenfolge der Treffer im Text entscheidet. */
const ROLE_CATEGORIES = new Map([
  // Politik, Staat, Militaer
  ['Politiker', ['Politik', 'Geschichte']],
  ['Politikerin', ['Politik', 'Geschichte']],
  ['Präsident', ['Politik', 'Geschichte']],
  ['Präsidentin', ['Politik', 'Geschichte']],
  ['Staatsmann', ['Politik', 'Geschichte']],
  ['Staatsoberhaupt', ['Politik', 'Geschichte']],
  ['Ministerpräsident', ['Politik', 'Geschichte']],
  ['Kanzler', ['Politik', 'Geschichte']],
  ['Diplomat', ['Politik', 'Geschichte']],
  ['Revolutionär', ['Politik', 'Geschichte']],
  ['Revolutionärin', ['Politik', 'Geschichte']],
  ['Freiheitskämpfer', ['Politik', 'Geschichte']],
  ['Freiheitskämpferin', ['Politik', 'Geschichte']],
  ['Unabhängigkeitsaktivist', ['Politik', 'Geschichte']],
  ['Aktivist', ['Ethik', 'Geschichte']],
  ['Aktivistin', ['Ethik', 'Geschichte']],
  ['Frauenrechtlerin', ['Ethik', 'Geschichte']],
  ['Reformer', ['Geschichte', 'Bildung']],
  ['Reformerin', ['Geschichte', 'Bildung']],
  ['Kaiser', ['Geschichte', 'Politik']],
  ['Kaiserin', ['Geschichte', 'Politik']],
  ['König', ['Geschichte', 'Politik']],
  ['Königin', ['Geschichte', 'Politik']],
  ['Sultan', ['Geschichte', 'Politik']],
  ['Zar', ['Geschichte', 'Politik']],
  ['Zarin', ['Geschichte', 'Politik']],
  ['Kalif', ['Geschichte', 'Politik']],
  ['Khan', ['Geschichte', 'Politik']],
  ['Großkhan', ['Geschichte', 'Politik']],
  ['Großmogul', ['Geschichte', 'Politik']],
  ['Shogun', ['Geschichte', 'Politik']],
  ['Herrscher', ['Geschichte', 'Politik']],
  ['Herrscherin', ['Geschichte', 'Politik']],
  ['Regent', ['Geschichte', 'Politik']],
  ['Regentin', ['Geschichte', 'Politik']],
  ['Erzherzogin', ['Geschichte', 'Politik']],
  ['Pharao', ['Geschichte', 'Politik']],
  ['General', ['Geschichte', 'Politik']],
  ['Feldherr', ['Geschichte', 'Politik']],
  ['Feldherrin', ['Geschichte', 'Politik']],
  ['Admiral', ['Geschichte', 'Politik']],
  ['Nationalheld', ['Geschichte']],
  ['Nationalheldin', ['Geschichte']],
  // Literatur, Publizistik
  ['Schriftsteller', ['Literatur']],
  ['Schriftstellerin', ['Literatur']],
  ['Dichter', ['Literatur']],
  ['Dichterin', ['Literatur']],
  ['Dramatiker', ['Literatur']],
  ['Dramatikerin', ['Literatur']],
  ['Romanautor', ['Literatur']],
  ['Fabeldichter', ['Literatur']],
  ['Lyriker', ['Literatur']],
  ['Poet', ['Literatur']],
  ['Essayist', ['Literatur']],
  ['Satiriker', ['Literatur']],
  ['Autor', ['Literatur']],
  ['Autorin', ['Literatur']],
  ['Journalist', ['Literatur']],
  ['Journalistin', ['Literatur']],
  ['Publizist', ['Literatur']],
  ['Publizistin', ['Literatur']],
  ['Chronist', ['Literatur', 'Geschichte']],
  ['Philologe', ['Literatur', 'Bildung']],
  // Philosophie, Religion, Geisteswissenschaft
  ['Philosoph', ['Philosophie']],
  ['Philosophin', ['Philosophie']],
  ['Staatsphilosoph', ['Philosophie', 'Politik']],
  ['Theologe', ['Philosophie']],
  ['Mystiker', ['Philosophie']],
  ['Humanist', ['Philosophie']],
  ['Mönch', ['Philosophie']],
  ['Soziologe', ['Wissenschaft', 'Philosophie']],
  ['Psychologe', ['Wissenschaft', 'Philosophie']],
  ['Psychoanalytiker', ['Medizin', 'Wissenschaft']],
  // Medizin
  ['Arzt', ['Medizin']],
  ['Ärztin', ['Medizin']],
  ['Augenarzt', ['Medizin']],
  ['Mediziner', ['Medizin', 'Forschung']],
  ['Medizinerin', ['Medizin', 'Forschung']],
  ['Chirurg', ['Medizin']],
  ['Physiologe', ['Medizin', 'Forschung']],
  ['Neurophysiologe', ['Medizin', 'Forschung']],
  ['Pathologe', ['Medizin', 'Forschung']],
  ['Psychiater', ['Medizin', 'Forschung']],
  ['Anatom', ['Medizin', 'Wissenschaft']],
  ['Immunologe', ['Medizin', 'Forschung']],
  ['Serologe', ['Medizin', 'Forschung']],
  ['Neurologe', ['Medizin', 'Forschung']],
  ['Bakteriologe', ['Medizin', 'Forschung']],
  ['Mikrobiologe', ['Medizin', 'Forschung']],
  ['Krankenpflegerin', ['Medizin', 'Geschichte']],
  ['Krankenpfleger', ['Medizin', 'Geschichte']],
  // Naturwissenschaft, Mathematik, Technik
  ['Physiker', ['Physik', 'Wissenschaft']],
  ['Physikerin', ['Physik', 'Wissenschaft']],
  ['Mathematiker', ['Mathematik', 'Wissenschaft']],
  ['Mathematikerin', ['Mathematik', 'Wissenschaft']],
  ['Chemiker', ['Wissenschaft', 'Forschung']],
  ['Chemikerin', ['Wissenschaft', 'Forschung']],
  ['Biologe', ['Wissenschaft', 'Forschung']],
  ['Zoologe', ['Wissenschaft', 'Forschung']],
  ['Botaniker', ['Wissenschaft', 'Forschung']],
  ['Geologe', ['Wissenschaft', 'Forschung']],
  ['Astronom', ['Wissenschaft', 'Forschung']],
  ['Astronomin', ['Wissenschaft', 'Forschung']],
  ['Naturforscher', ['Wissenschaft', 'Forschung']],
  ['Naturforscherin', ['Wissenschaft', 'Forschung']],
  ['Naturwissenschaftler', ['Wissenschaft', 'Forschung']],
  ['Genetiker', ['Wissenschaft', 'Forschung']],
  ['Geograph', ['Wissenschaft', 'Forschung']],
  ['Nobelpreisträger', ['Forschung']],
  ['Nobelpreisträgerin', ['Forschung']],
  ['Erfinder', ['Technologie', 'Wissenschaft']],
  ['Erfinderin', ['Technologie', 'Wissenschaft']],
  ['Ingenieur', ['Technologie', 'Wissenschaft']],
  ['Konstrukteur', ['Technologie']],
  // Wirtschaft
  ['Ökonom', ['Wirtschaft']],
  ['Ökonomin', ['Wirtschaft']],
  ['Unternehmer', ['Wirtschaft']],
  ['Unternehmerin', ['Wirtschaft']],
  ['Industrieller', ['Wirtschaft']],
  ['Kaufmann', ['Wirtschaft', 'Geschichte']],
  // Kunst, Architektur
  ['Maler', ['Kunst']],
  ['Malerin', ['Kunst']],
  ['Bildhauer', ['Kunst']],
  ['Bildhauerin', ['Kunst']],
  ['Grafiker', ['Kunst']],
  ['Grafikdesigner', ['Kunst']],
  ['Künstler', ['Kunst']],
  ['Künstlerin', ['Kunst']],
  ['Fotograf', ['Kunst']],
  ['Fotografin', ['Kunst']],
  ['Kupferstecher', ['Kunst']],
  ['Kunsttheoretiker', ['Kunst']],
  ['Kunstkritiker', ['Kunst', 'Literatur']],
  ['Typograph', ['Kunst']],
  ['Architekt', ['Architektur', 'Kunst']],
  ['Architektin', ['Architektur', 'Kunst']],
  ['Baumeister', ['Architektur', 'Kunst']],
  // Musik
  ['Komponist', ['Musik']],
  ['Komponistin', ['Musik']],
  ['Musiker', ['Musik']],
  ['Musikerin', ['Musik']],
  ['Pianist', ['Musik']],
  ['Pianistin', ['Musik']],
  ['Organist', ['Musik']],
  ['Dirigent', ['Musik']],
  ['Musikkritiker', ['Musik']],
  // Bildung, Geschichte, Entdeckung
  ['Pädagoge', ['Bildung']],
  ['Pädagogin', ['Bildung']],
  ['Gelehrter', ['Bildung', 'Philosophie']],
  ['Historiker', ['Geschichte', 'Forschung']],
  ['Archäologe', ['Geschichte', 'Forschung']],
  ['Ägyptologe', ['Geschichte', 'Forschung']],
  ['Kartograph', ['Geschichte', 'Forschung']],
  ['Entdecker', ['Geschichte', 'Forschung']],
  ['Entdeckerin', ['Geschichte', 'Forschung']],
  ['Seefahrer', ['Geschichte', 'Forschung']],
  ['Polarforscher', ['Geschichte', 'Forschung']],
  ['Forschungsreisender', ['Geschichte', 'Forschung']],
  ['Schachspieler', ['Bildung']],
  ['Schachmeister', ['Bildung']],
]);

// Laengste Nomen zuerst pruefen, damit "Musikkritiker" vor "Kritiker" bzw.
// "Neurophysiologe" vor "Physiologe" gewinnt und Spannen sauber verbraucht werden.
const ROLE_KEYS = [...ROLE_CATEGORIES.keys()].sort((a, b) => b.length - a.length);

const LETTER = /[A-Za-zÄÖÜäöüß]/;
const MAX_ROLES = 2;
const MAX_CATEGORIES = 3;

/** Beschreibung auf den aussagekraeftigen Kopf reduzieren. */
function headOf(description) {
  let text = String(description || '').replace(/\s+/g, ' ').trim();
  // Anreicherungs-Suffix und Nebensaetze abschneiden.
  text = text.split('—')[0];
  text = text.split(/[;.]/)[0];
  // Klammerzusaetze (Lebensdaten etc.) entfernen.
  text = text.replace(/\([^)]*\)/g, ' ');
  return text.trim();
}

/**
 * Leitet Anzeige-Rollen (Zeile 4) und Kategorien aus der Beschreibung ab.
 * Liefert { roles: string|null, categories: string[] } — roles ist null,
 * wenn kein bekanntes Rollen-Nomen gefunden wurde (dann greift der Aufrufer
 * auf den Ingest-Topf zurueck).
 */
export function deriveRolesAndCategories(description) {
  const head = headOf(description);
  if (!head) return { roles: null, categories: [] };

  const hits = [];
  const consumed = [];
  for (const key of ROLE_KEYS) {
    let from = 0;
    while (from < head.length) {
      const idx = head.indexOf(key, from);
      if (idx === -1) break;
      from = idx + 1;
      const before = idx > 0 ? head[idx - 1] : '';
      const after = idx + key.length < head.length ? head[idx + key.length] : '';
      // Linke Wortgrenze: Kompositum-Teile ("Staatsphilosoph") ausschliessen.
      if (before && LETTER.test(before)) continue;
      // Rechts nur Flexionsendungen zulassen (Praesidenten, Koenigs, ...).
      if (after && LETTER.test(after) && !/^(s|n|en|in|innen)\b/.test(head.slice(idx + key.length))) continue;
      // Bereits von laengerem Treffer verbrauchte Spanne ueberspringen.
      if (consumed.some(([s, e]) => idx < e && idx + key.length > s)) continue;
      consumed.push([idx, idx + key.length]);
      hits.push({ idx, key });
      break; // pro Nomen nur der erste Treffer
    }
  }
  if (!hits.length) return { roles: null, categories: [] };

  hits.sort((a, b) => a.idx - b.idx);
  const roleNames = [];
  const categories = [];
  for (const { key } of hits) {
    if (roleNames.length < MAX_ROLES && !roleNames.includes(key)) roleNames.push(key);
    for (const cat of ROLE_CATEGORIES.get(key)) {
      if (!categories.includes(cat)) categories.push(cat);
    }
  }
  return { roles: roleNames.join(', '), categories: categories.slice(0, MAX_CATEGORIES) };
}

export default deriveRolesAndCategories;
