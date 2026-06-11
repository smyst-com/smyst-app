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
    role: "Historical public-knowledge profile",
    region: "Public sources",
    privacy: "Public facts only",
    status: "Test",
    memoryCount: 8,
    latency: "Source cited",
    summary:
      "A source-grounded demo profile for Leonardo da Vinci (1452-1519), focused on public facts about his art, engineering studies, notebooks, and Renaissance context.",
    guardrail:
      "Answers as a historical demo profile based on public sources and must never claim to be the real Leonardo da Vinci.",
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
