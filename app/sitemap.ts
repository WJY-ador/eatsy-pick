import type { MetadataRoute } from "next";
import { analysisPath, parseScope } from "@/components/analysis/scope";
import { AREAS } from "@/lib/areas";
import { GROUPS } from "@/lib/report";
import { siteUrl } from "@/lib/site";

// 상권 분석은 기본 대표 URL만 넣어 필터 조합을 크롤링할 때의 조회를 줄인다.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const abs = (p: string) => new URL(p, base).toString();
  const out: MetadataRoute.Sitemap = [
    { url: abs("/") },
    { url: abs("/privacy") },
    { url: abs("/area") },
    { url: abs(analysisPath(parseScope({}).scope, null)) },
  ];
  for (const a of AREAS) {
    out.push({ url: abs(`/area/${a.slug}`) });
    for (const g of GROUPS) out.push({ url: abs(`/area/${a.slug}/${g.slug}`) });
  }
  return out;
}
