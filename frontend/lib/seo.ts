import type { Metadata } from "next";

export const siteUrl = "https://smyst.com";
export const siteName = "Smyst";

export const primaryLocales = [
  "en",
  "zh",
  "es",
  "ar",
  "fr",
  "de",
  "pt",
  "ru",
  "tr",
  "ja",
  "ko",
  "it",
  "hi",
  "id",
  "bn",
] as const;

export type PrimaryLocale = (typeof primaryLocales)[number];

export const localeNames: Record<PrimaryLocale, string> = {
  en: "English",
  zh: "Chinese",
  es: "Spanish",
  ar: "Arabic",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  ja: "Japanese",
  ko: "Korean",
  it: "Italian",
  hi: "Hindi",
  id: "Indonesian",
  bn: "Bengali",
};

export const localeMeta: Record<
  PrimaryLocale,
  {
    title: string;
    description: string;
    keywords: string[];
  }
> = {
  en: {
    title: "Smyst AI Twins",
    description:
      "Create, preserve, search, cite, and talk with secure digital AI twins built from human knowledge, memories, documents, media, and experience.",
    keywords: ["AI twins", "digital twin", "knowledge graph", "human knowledge", "AI memory"],
  },
  zh: {
    title: "Smyst AI 数字分身",
    description: "创建、保存、搜索、引用并对话由知识、记忆、文档和媒体构建的安全数字 AI 分身。",
    keywords: ["AI 数字分身", "知识图谱", "人类知识", "AI 记忆", "语义搜索"],
  },
  es: {
    title: "Smyst Gemelos de IA",
    description:
      "Crea, conserva, busca, cita y conversa con gemelos digitales de IA basados en conocimiento, recuerdos, documentos y medios.",
    keywords: ["gemelos de IA", "gemelo digital", "grafo de conocimiento", "memoria de IA"],
  },
  ar: {
    title: "Smyst التوائم الرقمية بالذكاء الاصطناعي",
    description: "أنشئ واحفظ وابحث واستشهد وتحدث مع توائم رقمية آمنة مبنية من المعرفة والذكريات والوثائق والوسائط.",
    keywords: ["توأم رقمي", "ذكاء اصطناعي", "رسم معرفي", "ذاكرة الذكاء الاصطناعي"],
  },
  fr: {
    title: "Smyst Jumeaux IA",
    description:
      "Creez, conservez, recherchez, citez et interrogez des jumeaux numeriques IA fondes sur le savoir, les souvenirs, les documents et les medias.",
    keywords: ["jumeaux IA", "jumeau numerique", "graphe de connaissances", "memoire IA"],
  },
  de: {
    title: "Smyst KI-Zwillinge",
    description:
      "Erstelle, bewahre, durchsuche, zitiere und befrage sichere digitale KI-Zwillinge aus Wissen, Erinnerungen, Dokumenten und Medien.",
    keywords: ["KI-Zwillinge", "digitaler Zwilling", "Wissensgraph", "menschliches Wissen", "KI-Gedaechtnis"],
  },
  pt: {
    title: "Smyst Gemeos de IA",
    description:
      "Crie, preserve, pesquise, cite e converse com gemeos digitais de IA baseados em conhecimento, memorias, documentos e midia.",
    keywords: ["gemeos de IA", "gemeo digital", "grafo de conhecimento", "memoria de IA"],
  },
  ru: {
    title: "Smyst ИИ-двойники",
    description: "Создавайте, храните, ищите, цитируйте и обсуждайте безопасных цифровых ИИ-двойников на основе знаний, памяти, документов и медиа.",
    keywords: ["ИИ-двойники", "цифровой двойник", "граф знаний", "память ИИ"],
  },
  tr: {
    title: "Smyst Yapay Zeka Twinleri",
    description:
      "Bilgi, anılar, belgeler ve medyadan olusan guvenli dijital yapay zeka twinlerini olusturun, saklayin, arayin, alintilayin ve konusun.",
    keywords: ["yapay zeka twini", "dijital twin", "bilgi grafigi", "AI bellek"],
  },
  ja: {
    title: "Smyst AI デジタルツイン",
    description: "知識、記憶、文書、メディアから安全な AI デジタルツインを作成、保存、検索、引用し、対話できます。",
    keywords: ["AI デジタルツイン", "ナレッジグラフ", "人間の知識", "AI メモリ"],
  },
  ko: {
    title: "Smyst AI 디지털 트윈",
    description: "지식, 기억, 문서, 미디어로 만든 안전한 AI 디지털 트윈을 생성, 보존, 검색, 인용하고 대화하세요.",
    keywords: ["AI 디지털 트윈", "지식 그래프", "인간 지식", "AI 메모리"],
  },
  it: {
    title: "Smyst Gemelli IA",
    description:
      "Crea, conserva, cerca, cita e conversa con gemelli digitali IA sicuri basati su conoscenze, ricordi, documenti e media.",
    keywords: ["gemelli IA", "gemello digitale", "grafo della conoscenza", "memoria IA"],
  },
  hi: {
    title: "Smyst AI डिजिटल ट्विन",
    description: "ज्ञान, यादों, दस्तावेजों और मीडिया से बने सुरक्षित डिजिटल AI ट्विन बनाएं, सहेजें, खोजें, उद्धृत करें और उनसे बात करें।",
    keywords: ["AI डिजिटल ट्विन", "ज्ञान ग्राफ", "मानव ज्ञान", "AI मेमोरी"],
  },
  id: {
    title: "Smyst AI Twins",
    description:
      "Buat, simpan, cari, kutip, dan bicara dengan AI twin digital yang aman dari pengetahuan, ingatan, dokumen, dan media.",
    keywords: ["AI twin", "digital twin", "graf pengetahuan", "memori AI"],
  },
  bn: {
    title: "Smyst AI ডিজিটাল টুইন",
    description: "জ্ঞান, স্মৃতি, নথি ও মিডিয়া থেকে নিরাপদ ডিজিটাল AI টুইন তৈরি, সংরক্ষণ, অনুসন্ধান, উদ্ধৃতি ও কথোপকথন করুন।",
    keywords: ["AI ডিজিটাল টুইন", "জ্ঞান গ্রাফ", "মানব জ্ঞান", "AI মেমরি"],
  },
};

export function isPrimaryLocale(value: string): value is PrimaryLocale {
  return primaryLocales.includes(value as PrimaryLocale);
}

export function localeAlternates(path = ""): Record<string, string> {
  return Object.fromEntries([
    ...primaryLocales.map((locale) => [locale, `/${locale}${path}`]),
    ["x-default", `/en${path}`],
  ]);
}

export function buildLocaleMetadata(locale: PrimaryLocale): Metadata {
  const meta = localeMeta[locale];
  const canonical = `/${locale}`;
  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: {
      canonical,
      languages: localeAlternates(),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${siteUrl}${canonical}`,
      siteName,
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
  };
}

export function buildStructuredData(locale: PrimaryLocale) {
  const meta = localeMeta[locale];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: siteName,
        url: siteUrl,
        inLanguage: primaryLocales,
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl}/${locale}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: siteName,
        url: siteUrl,
        description: meta.description,
        sameAs: [],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: siteName,
        applicationCategory: "AIApplication",
        operatingSystem: "Web, PWA, iOS, Android",
        url: `${siteUrl}/${locale}`,
        description: meta.description,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/${locale}#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "What is a Smyst AI twin?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "A Smyst AI twin is a secure digital representation built from approved memories, knowledge, documents, media, and structured facts.",
            },
          },
          {
            "@type": "Question",
            name: "Can AI systems understand Smyst profiles?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Smyst profiles are designed to expose structured metadata, citations, knowledge graph entities, and machine-readable summaries.",
            },
          },
        ],
      },
    ],
  };
}
