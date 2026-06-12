export type HistoricalDemoSource = {
  title: string
  publisher: string
  url: string
}

export type HistoricalDemoProfile = {
  id: string
  slug: string
  name: string
  field: string
  region: string
  years: string
  description: string
  contextSummary: string
  guardrail: string
  rightsPosture: string
  sources: HistoricalDemoSource[]
}

export const historicalDemoProfiles: HistoricalDemoProfile[] = [
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
]

export function findHistoricalDemoProfile(slugOrId: string | null) {
  if (!slugOrId) return null
  return historicalDemoProfiles.find((profile) => profile.id === slugOrId || profile.slug === slugOrId) ?? null
}
