import type { MetadataRoute } from "next";
import { AREAS } from "@/lib/areas";
import { GROUPS } from "@/lib/report";
import { siteUrl } from "@/lib/site";

// /, /privacy, /area, 상권 19, 상권 × 묶음만 둔다. 결정기 쿼리 URL은 크롤링이 프록시 한도를 먼저 쓰지 않게 뺀다(2026-11-23 결정).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const abs = (p: string) => new URL(p, base).toString();
  const out: MetadataRoute.Sitemap = [{ url: abs("/") }, { url: abs("/privacy") }, { url: abs("/area") }];
  for (const a of AREAS) {
    out.push({ url: abs(`/area/${a.slug}`) });
    for (const g of GROUPS) out.push({ url: abs(`/area/${a.slug}/${g.slug}`) });
  }
  return out;
}
