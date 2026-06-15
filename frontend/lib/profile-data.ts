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

export const twins: Twin[] = [];

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export const initialMessages: ChatMessage[] = [];
