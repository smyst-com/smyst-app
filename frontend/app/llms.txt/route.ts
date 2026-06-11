import { localeMeta, primaryLocales, siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# Smyst",
    "",
    "Smyst is a platform for secure digital AI twins built from human knowledge, memories, documents, images, audio, video, and structured facts.",
    "",
    "Primary URLs:",
    ...primaryLocales.map((locale) => `- ${locale}: ${siteUrl}/${locale} - ${localeMeta[locale].description}`),
    "",
    "Machine-readable focus:",
    "- Digital AI twins",
    "- Human knowledge preservation",
    "- Structured memory and citations",
    "- Knowledge graph entities and relationships",
    "- Multilingual semantic search",
    "- Public profile, knowledge, question, document, media, and twin pages when user consent allows indexing",
    "",
    "Indexing policy:",
    "- Public and consented content can be indexed.",
    "- Private, restricted, deleted, or unverified personal data must not be indexed.",
    "- Every public claim should expose provenance, source references, and trust signals.",
    "",
    "API policy:",
    "- Do not crawl API routes.",
    "- Use public web pages, sitemaps, structured data, and future public knowledge graph endpoints.",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
