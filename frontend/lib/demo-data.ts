export type Twin = {
  id: string;
  name: string;
  role: string;
  region: string;
  privacy: string;
  status: string;
  memoryCount: number;
  latency: string;
  summary: string;
  guardrail?: string;
  launchWave?: string;
  rightsPosture?: string;
  sources?: Array<{
    title: string;
    publisher: string;
    url: string;
  }>;
};

export const twins: Twin[] = [
  {
    id: "founder",
    name: "Founder Twin",
    role: "Strategic decision model",
    region: "EU",
    privacy: "Private by default",
    status: "Ready",
    memoryCount: 128,
    latency: "< 1s",
    summary: "A careful, privacy-first twin focused on product direction and operating principles.",
  },
  {
    id: "mentor",
    name: "Mentor Twin",
    role: "Personal knowledge guide",
    region: "EU",
    privacy: "Restricted",
    status: "Building",
    memoryCount: 64,
    latency: "Streaming",
    summary: "A reflective twin built from notes, documents, and decision patterns.",
  },
  {
    id: "archive",
    name: "Archive Twin",
    role: "Memory archive",
    region: "EU",
    privacy: "Owner only",
    status: "Draft",
    memoryCount: 21,
    latency: "Async",
    summary: "A private archive twin for long-term memory extraction and versioned persona builds.",
  },
  {
    id: "leonardo-da-vinci",
    name: "Leonardo da Vinci Demo Twin",
    role: "Renaissance art and engineering",
    region: "Italy / France",
    privacy: "Public facts only",
    status: "Wave 1",
    memoryCount: 8,
    latency: "Source cited",
    summary:
      "A source-grounded demo profile for Leonardo da Vinci (1452-1519), focused on public facts about his art, engineering studies, notebooks, and Renaissance context.",
    guardrail:
      "Answers as a historical demo profile based on public sources and must never claim to be the real Leonardo da Vinci.",
    launchWave: "Low-risk historical starter",
    rightsPosture: "Long deceased; use original smyst copy and licensed/public-domain-safe imagery only.",
    sources: [
      {
        title: "Leonardo da Vinci",
        publisher: "Encyclopaedia Britannica",
        url: "https://www.britannica.com/biography/Leonardo-da-Vinci",
      },
      {
        title: "Leonardo da Vinci (1452-1519)",
        publisher: "The Metropolitan Museum of Art",
        url: "https://www.metmuseum.org/essays/leonardo-da-vinci-1452-1519",
      },
    ],
  },
  {
    id: "isaac-newton",
    name: "Isaac Newton Demo Twin",
    role: "Physics and mathematics",
    region: "England",
    privacy: "Public facts only",
    status: "Wave 1",
    memoryCount: 7,
    latency: "Source cited",
    summary:
      "A source-grounded demo profile for Isaac Newton (1642-1727), focused on mechanics, gravity, optics, calculus, and the Scientific Revolution.",
    guardrail:
      "Answers as a historical demo profile based on public sources and must never claim to be the real Isaac Newton.",
    launchWave: "Low-risk historical starter",
    rightsPosture: "Long deceased; avoid modern book scans, portraits, and editions unless rights are verified.",
    sources: [
      {
        title: "Isaac Newton",
        publisher: "Encyclopaedia Britannica",
        url: "https://www.britannica.com/biography/Isaac-Newton",
      },
      {
        title: "Sir Isaac Newton",
        publisher: "The Royal Society",
        url: "https://royalsociety.org/people/isaac-newton-11991/",
      },
    ],
  },
  {
    id: "william-shakespeare",
    name: "William Shakespeare Demo Twin",
    role: "Literature and theatre",
    region: "England",
    privacy: "Public facts only",
    status: "Wave 1",
    memoryCount: 7,
    latency: "Source cited",
    summary:
      "A source-grounded demo profile for William Shakespeare (1564-1616), focused on plays, poems, Elizabethan theatre, and long-term cultural influence.",
    guardrail:
      "Answers as a historical demo profile based on public sources and must never claim to be the real William Shakespeare.",
    launchWave: "Low-risk historical starter",
    rightsPosture: "Long deceased; use public-domain text carefully and avoid modern annotated editions without permission.",
    sources: [
      {
        title: "William Shakespeare",
        publisher: "Encyclopaedia Britannica",
        url: "https://www.britannica.com/biography/William-Shakespeare",
      },
      {
        title: "Shakespeare's life",
        publisher: "Shakespeare Birthplace Trust",
        url: "https://www.shakespeare.org.uk/explore-shakespeare/shakespedia/william-shakespeare/shakespeares-life/",
      },
    ],
  },
  {
    id: "aristotle",
    name: "Aristotle Demo Twin",
    role: "Philosophy and science",
    region: "Ancient Greece",
    privacy: "Public facts only",
    status: "Wave 1",
    memoryCount: 6,
    latency: "Source cited",
    summary:
      "A source-grounded demo profile for Aristotle (384-322 BCE), focused on logic, ethics, politics, biology, rhetoric, and ancient Greek philosophy.",
    guardrail:
      "Answers as a historical demo profile based on public sources and must never claim to be the real Aristotle.",
    launchWave: "Low-risk historical starter",
    rightsPosture: "Ancient figure; avoid copying modern translations or commentary without rights clearance.",
    sources: [
      {
        title: "Aristotle",
        publisher: "Encyclopaedia Britannica",
        url: "https://www.britannica.com/biography/Aristotle",
      },
      {
        title: "Aristotle",
        publisher: "Stanford Encyclopedia of Philosophy",
        url: "https://plato.stanford.edu/entries/aristotle/",
      },
    ],
  },
  {
    id: "sun-tzu",
    name: "Sun Tzu Demo Twin",
    role: "Strategy and military thought",
    region: "Ancient China",
    privacy: "Public facts only",
    status: "Wave 1",
    memoryCount: 5,
    latency: "Source cited",
    summary:
      "A source-grounded demo profile for Sun Tzu, focused on the historical tradition around The Art of War and its influence on strategy.",
    guardrail:
      "Answers as a historical demo profile based on public sources and must distinguish known history from later tradition or legend.",
    launchWave: "Low-risk historical starter",
    rightsPosture: "Ancient figure; avoid copying modern translations of The Art of War unless rights are verified.",
    sources: [
      {
        title: "Sunzi",
        publisher: "Encyclopaedia Britannica",
        url: "https://www.britannica.com/biography/Sunzi",
      },
      {
        title: "Sunzi",
        publisher: "Internet Encyclopedia of Philosophy",
        url: "https://iep.utm.edu/sunzi/",
      },
    ],
  },
];

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export const initialMessages: ChatMessage[] = [
  {
    id: "a1",
    role: "assistant",
    content:
      "I am ready with the selected twin context. I will answer from allowed memories and avoid unsupported claims.",
  },
];
