import { localeMeta, primaryLocales, siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

type Props = {
  params: {
    locale: string;
  };
};

export function generateStaticParams() {
  return primaryLocales.map((locale) => ({ locale }));
}

export function GET(_request: Request, { params }: Props) {
  const locale = primaryLocales.includes(params.locale as (typeof primaryLocales)[number])
    ? (params.locale as (typeof primaryLocales)[number])
    : "en";
  const meta = localeMeta[locale];
  const lines = [
    `# ${meta.title}`,
    "",
    meta.description,
    "",
    `Canonical: ${siteUrl}/${locale}`,
    `Language: ${locale}`,
    "",
    "Public content types:",
    `- Profiles: ${siteUrl}/${locale}/profiles`,
    `- AI twins: ${siteUrl}/${locale}/twins`,
    `- Knowledge pages: ${siteUrl}/${locale}/knowledge`,
    `- Questions and answers: ${siteUrl}/${locale}/questions`,
    `- Documents: ${siteUrl}/${locale}/documents`,
    `- Media: ${siteUrl}/${locale}/media`,
    "",
    "Structured data:",
    "- WebSite",
    "- Organization",
    "- SoftwareApplication",
    "- FAQPage",
    "- Future: Person, CreativeWork, MediaObject, Dataset, ClaimReview, DefinedTerm, and ItemList",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
