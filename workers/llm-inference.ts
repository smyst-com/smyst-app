/**
 * Smyst — Hybrid LLM Inference Gateway
 * ------------------------------------
 * Turns a twin + user message into a real LLM answer.
 *
 * Strategy (configurable via SMYST_AI_ROUTER_MODE):
 *   - "salad-only"  → only the self-hosted, OpenAI-compatible model on Salad.
 *   - "hybrid"      → Salad for fast turns, a frontier provider for hard turns,
 *                     each one falling back to the other. (default)
 *   - "frontier"    → frontier providers only (OpenRouter / Groq / Gemini /
 *                     Claude / Grok / DeepSeek / Kimi / Mistral / OpenAI).
 *
 * Design goals: low latency (hard timeout + instant template fallback handled
 * by the caller), resilience (provider fallback chain), privacy (Salad default),
 * and a single place to add/swap providers.
 *
 * This module is deliberately decoupled from the Worker types so it can be
 * unit-tested in isolation. It only needs `fetch`.
 */

/* ----------------------------- Public types ------------------------------ */

export interface LlmEnv {
  // Self-hosted OpenAI-compatible inference (Salad container).
  SMYST_AI_INFERENCE_BASE_URL?: string; // e.g. https://<dns>.salad.cloud/v1
  SMYST_AI_INFERENCE_API_KEY?: string; // optional bearer for the container
  SALAD_API_KEY?: string; // used as bearer if INFERENCE_API_KEY is unset

  // Routing policy.
  SMYST_AI_ROUTER_MODE?: string; // salad-only | hybrid | frontier
  SMYST_AI_PRIMARY_PROVIDER?: string; // openrouter | groq | gemini | claude | grok | deepseek | kimi | mistral | openai
  SMYST_AI_MODEL_FAST?: string;
  SMYST_AI_MODEL_REASONING?: string;
  SMYST_AI_MODEL_RAG?: string;
  SMYST_AI_TIMEOUT_MS?: string;
  SMYST_AI_MAX_TOKENS?: string;

  // Frontier provider credentials (all optional; only configured ones are used).
  OPENROUTER_API_KEY?: string;
  SMYST_AI_OPENROUTER_MODEL?: string;
  GROQ_API_KEY?: string;
  SMYST_AI_GROQ_MODEL?: string;
  GEMINI_API_KEY?: string;
  SMYST_AI_GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  SMYST_AI_CLAUDE_MODEL?: string;
  XAI_API_KEY?: string;
  SMYST_AI_GROK_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  SMYST_AI_DEEPSEEK_MODEL?: string;
  MOONSHOT_API_KEY?: string;
  SMYST_AI_KIMI_MODEL?: string;
  MISTRAL_API_KEY?: string;
  SMYST_AI_MISTRAL_MODEL?: string;
  OPENAI_API_KEY?: string;
  SMYST_AI_OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
}

export interface TwinForPrompt {
  name: string;
  description?: string;
  style?: string;
  answerStyle?: string;
  contextSummary?: string;
  guardrail?: string;
  categories?: string[];
  languages?: string[];
  knowledgeTexts?: Array<{ title?: string; text: string }>;
  birthLabel?: string;
  deathLabel?: string;
  sources?: Array<{ title: string; publisher?: string; url?: string }>;
}

export interface InferenceMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface InferenceResult {
  text: string;
  provider: string;
  model: string;
}

/* ------------------------------- Helpers --------------------------------- */

function txt(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function intEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(txt(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clip(value: string, max: number): string {
  const s = value.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/* --------------------------- RAG (lightweight) --------------------------- */

const STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'oder', 'ist', 'ein', 'eine', 'was', 'wie', 'wer',
  'the', 'and', 'for', 'are', 'was', 'what', 'who', 'how', 'why', 'with', 'you',
  'ich', 'mir', 'mich', 'dein', 'mein', 'von', 'zu', 'in', 'auf', 'für', 'fuer',
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Embedding-free retrieval over the twin's knowledge: rank chunks by query-term
 * overlap and return the strongest few within a character budget. Good enough
 * for v1 inside the Worker; swap for vector search later without touching the
 * prompt builder.
 */
export function selectRagContext(twin: TwinForPrompt, userMessage: string, charBudget = 2400): string {
  const chunks: string[] = [];
  if (twin.contextSummary) chunks.push(twin.contextSummary);
  for (const item of twin.knowledgeTexts ?? []) {
    const head = item.title ? `${item.title}: ` : '';
    if (item.text) chunks.push(`${head}${item.text}`);
  }
  if (!chunks.length) return '';

  const queryTerms = new Set(tokenize(userMessage));
  const scored = chunks.map((chunk) => {
    const terms = tokenize(chunk);
    let score = 0;
    for (const t of terms) if (queryTerms.has(t)) score += 1;
    return { chunk, score };
  });

  // If nothing matched, fall back to the first chunks (still useful context).
  const anyMatch = scored.some((s) => s.score > 0);
  const ordered = anyMatch
    ? scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
    : scored;

  const picked: string[] = [];
  let used = 0;
  for (const { chunk } of ordered) {
    const c = clip(chunk, 700);
    if (used + c.length > charBudget) continue;
    picked.push(`- ${c}`);
    used += c.length;
    if (picked.length >= 5) break;
  }
  return picked.join('\n');
}

/* ---------------------------- Prompt builder ----------------------------- */

/**
 * The system prompt is the heart of twin quality and safety. It establishes the
 * persona from the twin's own data, injects retrieved knowledge, and enforces
 * the non-negotiable guardrail: this is an AI twin grounded in sources, never a
 * claim to BE the real person.
 */
export function buildTwinSystemPrompt(twin: TwinForPrompt, ragContext: string): string {
  const name = txt(twin.name) || 'dieser Twin';
  const lines: string[] = [];

  lines.push(
    `Du bist „${name}" — ein KI-Twin auf der Plattform Smyst. Du bist eine respektvolle, `
      + `wissensbasierte Nachbildung dieser Person/Figur, NICHT die echte Person selbst.`,
  );

  const life = [twin.birthLabel, twin.deathLabel].filter(Boolean).join(' – ');
  if (life) lines.push(`Lebensdaten: ${life}.`);
  if (txt(twin.description)) lines.push(`Über dich: ${clip(twin.description!, 800)}`);
  if (txt(twin.style)) lines.push(`Denk- und Kommunikationsstil: ${clip(twin.style!, 300)}`);
  if (txt(twin.answerStyle)) lines.push(`Antwortstil: ${clip(twin.answerStyle!, 300)}`);
  if (twin.categories?.length) lines.push(`Themenschwerpunkte: ${twin.categories.slice(0, 6).join(', ')}.`);

  lines.push('');
  lines.push('Regeln:');
  lines.push('1. Antworte in der Sprache des Nutzers, natürlich, präzise und hilfreich.');
  lines.push(
    '2. Bleibe konsequent in der Persona (Tonfall, Werte, Perspektive), aber gib dich nie '
      + 'als die reale Person aus und behaupte keine Live-Erlebnisse oder Echtzeit-Wissen.',
  );
  lines.push(
    '3. Stütze inhaltliche Aussagen vorrangig auf den bereitgestellten Kontext. '
      + 'Wenn etwas nicht belegt ist, sage das ehrlich, statt zu erfinden.',
  );
  lines.push('4. Keine medizinische, rechtliche oder finanzielle Beratung als Gewissheit; verweise auf Fachleute.');
  lines.push('5. Fasse dich so kurz wie möglich und so lang wie nötig. Keine Floskel-Bausteine.');
  if (txt(twin.guardrail)) lines.push(`6. Zusätzliche Vorgabe: ${clip(twin.guardrail!, 300)}`);

  if (ragContext) {
    lines.push('');
    lines.push('Belegter Wissenskontext (nur intern, nicht wörtlich zitieren müssen):');
    lines.push(ragContext);
  }

  return lines.join('\n');
}

/* --------------------------- Provider adapters --------------------------- */

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await p(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

interface CompletionArgs {
  system: string;
  messages: InferenceMessage[];
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

/** OpenAI-compatible Chat Completions — covers Salad, OpenAI, DeepSeek, Mistral, Grok, Kimi. */
async function openAiCompatibleComplete(
  baseUrl: string,
  apiKey: string,
  args: CompletionArgs,
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: 0.7,
    messages: [{ role: 'system', content: args.system }, ...args.messages],
  };
  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    args.timeoutMs,
  );
  if (!res.ok) throw new Error(`openai_compatible_${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = txt(data.choices?.[0]?.message?.content);
  if (!text) throw new Error('openai_compatible_empty');
  return text;
}

/** Anthropic Messages API (Claude). */
async function anthropicComplete(apiKey: string, args: CompletionArgs): Promise<string> {
  const res = await withTimeout(
    (signal) =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          system: args.system,
          messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      }),
    args.timeoutMs,
  );
  if (!res.ok) throw new Error(`anthropic_${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = txt(data.content?.map((c) => c.text || '').join(''));
  if (!text) throw new Error('anthropic_empty');
  return text;
}

/** Google Gemini generateContent. */
async function geminiComplete(apiKey: string, args: CompletionArgs): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const contents = args.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents,
          generationConfig: { maxOutputTokens: args.maxTokens, temperature: 0.7 },
        }),
      }),
    args.timeoutMs,
  );
  if (!res.ok) throw new Error(`gemini_${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = txt(data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join(''));
  if (!text) throw new Error('gemini_empty');
  return text;
}

/* ------------------------------ Provider map ----------------------------- */

const OPENAI_COMPATIBLE_BASES: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  grok: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  kimi: 'https://api.moonshot.cn/v1',
  mistral: 'https://api.mistral.ai/v1',
  openai: 'https://api.openai.com/v1',
};

const DEFAULT_MODELS: Record<string, string> = {
  openrouter: 'openai/gpt-4o',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-1.5-flash',
  claude: 'claude-3-5-sonnet-latest',
  grok: 'grok-2-latest',
  deepseek: 'deepseek-chat',
  kimi: 'moonshot-v1-8k',
  mistral: 'mistral-large-latest',
  openai: 'gpt-4o-mini',
};

interface ResolvedProvider {
  name: string;
  run: (args: CompletionArgs) => Promise<string>;
  defaultModel: string;
}

function resolveFrontierProvider(name: string, env: LlmEnv): ResolvedProvider | null {
  switch (name) {
    case 'gemini': {
      const key = txt(env.GEMINI_API_KEY);
      if (!key) return null;
      return { name, defaultModel: txt(env.SMYST_AI_GEMINI_MODEL) || DEFAULT_MODELS.gemini, run: (a) => geminiComplete(key, a) };
    }
    case 'claude': {
      const key = txt(env.ANTHROPIC_API_KEY);
      if (!key) return null;
      return { name, defaultModel: txt(env.SMYST_AI_CLAUDE_MODEL) || DEFAULT_MODELS.claude, run: (a) => anthropicComplete(key, a) };
    }
    case 'openrouter':
    case 'groq':
    case 'grok':
    case 'deepseek':
    case 'kimi':
    case 'mistral':
    case 'openai': {
      const keyByName: Record<string, string> = {
        openrouter: txt(env.OPENROUTER_API_KEY),
        groq: txt(env.GROQ_API_KEY),
        grok: txt(env.XAI_API_KEY),
        deepseek: txt(env.DEEPSEEK_API_KEY),
        kimi: txt(env.MOONSHOT_API_KEY),
        mistral: txt(env.MISTRAL_API_KEY),
        openai: txt(env.OPENAI_API_KEY),
      };
      const modelByName: Record<string, string> = {
        openrouter: txt(env.SMYST_AI_OPENROUTER_MODEL),
        groq: txt(env.SMYST_AI_GROQ_MODEL),
        grok: txt(env.SMYST_AI_GROK_MODEL),
        deepseek: txt(env.SMYST_AI_DEEPSEEK_MODEL),
        kimi: txt(env.SMYST_AI_KIMI_MODEL),
        mistral: txt(env.SMYST_AI_MISTRAL_MODEL),
        openai: txt(env.SMYST_AI_OPENAI_MODEL),
      };
      const key = keyByName[name];
      if (!key) return null;
      const base = name === 'openai' ? (txt(env.OPENAI_BASE_URL) || OPENAI_COMPATIBLE_BASES.openai) : OPENAI_COMPATIBLE_BASES[name];
      return {
        name,
        defaultModel: modelByName[name] || DEFAULT_MODELS[name],
        run: (a) => openAiCompatibleComplete(base, key, a),
      };
    }
    default:
      return null;
  }
}

function resolveSaladProvider(env: LlmEnv): ResolvedProvider | null {
  const base = txt(env.SMYST_AI_INFERENCE_BASE_URL);
  if (!base) return null;
  const key = txt(env.SMYST_AI_INFERENCE_API_KEY) || txt(env.SALAD_API_KEY);
  return {
    name: 'salad',
    defaultModel: txt(env.SMYST_AI_MODEL_FAST) || 'smyst-twin',
    run: (a) => openAiCompatibleComplete(base, key, a),
  };
}

/* ------------------------------- Routing --------------------------------- */

const REASONING_HINTS = [
  'warum', 'analysiere', 'vergleiche', 'erkläre', 'erklaere', 'beweis', 'code',
  'why', 'analyze', 'compare', 'explain', 'prove', 'strategy', 'strategie', 'plan',
];

export function isComplexQuery(message: string): boolean {
  const m = message.toLowerCase();
  if (m.length > 240) return true;
  return REASONING_HINTS.some((h) => m.includes(h));
}

export function routerMode(env: LlmEnv): 'salad-only' | 'hybrid' | 'frontier' {
  const mode = txt(env.SMYST_AI_ROUTER_MODE).toLowerCase();
  if (mode === 'salad-only' || mode === 'frontier') return mode;
  return 'hybrid';
}

/**
 * Build the ordered provider chain for this request. The first provider that
 * returns text wins; the rest are fallbacks.
 */
export function buildProviderChain(env: LlmEnv, complex: boolean): ResolvedProvider[] {
  const mode = routerMode(env);
  const salad = resolveSaladProvider(env);
  const primaryName = txt(env.SMYST_AI_PRIMARY_PROVIDER).toLowerCase() || 'gemini';
  const frontierOrder = [
    primaryName,
    ...['openrouter', 'groq', 'gemini', 'claude', 'grok', 'deepseek', 'kimi', 'mistral', 'openai'].filter((n) => n !== primaryName),
  ];
  const frontier = frontierOrder
    .map((n) => resolveFrontierProvider(n, env))
    .filter((p): p is ResolvedProvider => p !== null);

  if (mode === 'salad-only') return salad ? [salad] : [];
  if (mode === 'frontier') return frontier;

  // hybrid: hard turns prefer frontier, easy turns prefer salad; always cross-fallback.
  const chain = complex ? [...frontier, ...(salad ? [salad] : [])] : [...(salad ? [salad] : []), ...frontier];
  // de-dupe by name, preserve order
  const seen = new Set<string>();
  return chain.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
}

export function hasAnyProvider(env: LlmEnv): boolean {
  return buildProviderChain(env, false).length > 0 || buildProviderChain(env, true).length > 0;
}

/**
 * Main entry: produce a real twin answer, or null if no provider is configured
 * or all providers fail/time out (caller then uses the instant template).
 */
export async function generateTwinAnswer(
  env: LlmEnv,
  twin: TwinForPrompt,
  userMessage: string,
  history: InferenceMessage[] = [],
): Promise<InferenceResult | null> {
  const complex = isComplexQuery(userMessage);
  const chain = buildProviderChain(env, complex);
  if (!chain.length) return null;

  const ragContext = selectRagContext(twin, userMessage);
  const system = buildTwinSystemPrompt(twin, ragContext);
  const timeoutMs = intEnv(env.SMYST_AI_TIMEOUT_MS, 12000);
  const maxTokens = intEnv(env.SMYST_AI_MAX_TOKENS, 700);
  const reasoningModel = txt(env.SMYST_AI_MODEL_REASONING);
  const fastModel = txt(env.SMYST_AI_MODEL_FAST);

  const messages: InferenceMessage[] = [...history.slice(-8), { role: 'user', content: userMessage }];

  for (const provider of chain) {
    // Allow Salad to use the reasoning model on complex turns when configured.
    let model = provider.defaultModel;
    if (provider.name === 'salad') model = (complex && reasoningModel) || fastModel || provider.defaultModel;
    try {
      const text = await provider.run({ system, messages, model, maxTokens, timeoutMs });
      return { text, provider: provider.name, model };
    } catch {
      // try next provider in the chain
      continue;
    }
  }
  return null;
}
