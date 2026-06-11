import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { siteUrl } from "@/lib/seo";

const routePriorities: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/profiles", priority: 0.9, changeFrequency: "daily" },
  { path: "/twins", priority: 0.9, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/knowledge", priority: 0.85, changeFrequency: "daily" },
  { path: "/questions", priority: 0.85, changeFrequency: "daily" },
  { path: "/documents", priority: 0.8, changeFrequency: "daily" },
  { path: "/media", priority: 0.8, changeFrequency: "daily" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return locales.flatMap((locale) =>
    routePriorities.map((route) => ({
      url: `${siteUrl}/${locale}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
  );
}
