import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isLocale } from "@/lib/i18n";
import { localeAlternates, localeMeta, siteName, siteUrl } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://smyst.com"),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: localeMeta.en.description,
  applicationName: siteName,
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/en",
    languages: localeAlternates(),
  },
  openGraph: {
    title: siteName,
    description: localeMeta.en.description,
    url: siteUrl,
    siteName,
    type: "website",
  },
};

export default function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params?: { locale?: string };
}) {
  const lang = params?.locale && isLocale(params.locale) ? params.locale : "de";
  const dir = lang === "ar" ? "rtl" : "ltr";
  return (
    <html lang={lang} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
