import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SmystApp } from "@/components/smyst-app";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { buildLocaleMetadata, buildStructuredData, localeAlternates } from "@/lib/seo";

const sections = ["profiles", "twins", "search", "knowledge", "questions", "documents", "media"] as const;

type Section = (typeof sections)[number];

type Props = {
  params: {
    locale: string;
    section: string;
  };
};

function isSection(value: string): value is Section {
  return sections.includes(value as Section);
}

export function generateStaticParams() {
  return locales.flatMap((locale) => sections.map((section) => ({ locale, section })));
}

export function generateMetadata({ params }: Props): Metadata {
  if (!isLocale(params.locale) || !isSection(params.section)) return {};
  const metadata = buildLocaleMetadata(params.locale);
  const path = `/${params.section}`;
  return {
    ...metadata,
    alternates: {
      canonical: `/${params.locale}${path}`,
      languages: localeAlternates(path),
    },
  };
}

export default function LocaleSectionPage({ params }: Props) {
  if (!isLocale(params.locale) || !isSection(params.section)) notFound();
  const locale = params.locale as Locale;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildStructuredData(locale)).replace(/</g, "\\u003c"),
        }}
      />
      <SmystApp locale={locale} dictionary={getDictionary(locale)} />
    </>
  );
}
