import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SmystApp } from "@/components/smyst-app";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { buildLocaleMetadata, buildStructuredData } from "@/lib/seo";

type Props = {
  params: {
    locale: string;
  };
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: Props): Metadata {
  if (!isLocale(params.locale)) return {};
  return buildLocaleMetadata(params.locale);
}

export default function LocalePage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
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
