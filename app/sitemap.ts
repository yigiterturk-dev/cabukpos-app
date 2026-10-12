import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable()) return [];
  const now = new Date();
  return [
    { url: `${siteUrl()}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl()}/demo`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl()}/demo/ai-siparis`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl()}/demo/konusarak-yonet`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl()}/fiyatlandirma`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl()}/yardim`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...["iade-iptal", "iletisim", "kullanim-kosullari", "kvkk", "mesafeli-satis"].map((p) => ({
      url: `${siteUrl()}/yasal/${p}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
