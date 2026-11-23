import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisView } from "@/components/analysis/AnalysisView";
import { analysisPath, loadInput, ogPath, parseScope, scopeName } from "@/components/analysis/scope";
import s from "@/components/analysis/analysis.module.css";
import { parseFilters, splitPeak } from "@/lib/analytics";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { loadArea } from "@/lib/stores";

export const maxDuration = 30;

// 메타데이터는 API를 부르지 않는다. 상권 이름은 프리셋이나 loc 값에서 바로 나온다.
export async function generateMetadata({ searchParams }: PageProps<"/analysis">): Promise<Metadata> {
  const raw = await searchParams;
  const { scope } = parseScope(raw);
  const f = parseFilters(raw);
  const name = scopeName(scope);
  const title = `${name} 상권 분석 | ${SITE_NAME}`;
  const parts: string[] = [];
  if (f.cat) parts.push(f.cat);
  if (f.peak) {
    const { day, time } = splitPeak(f.peak);
    parts.push(`${day} ${time} 피크`);
  }
  if (f.cust) parts.push(f.cust);
  const description = `${name}의 BC카드 결제 데이터로 업종, 대표 피크 요일과 시간대, 주 고객층을 나눠 봅니다.${
    parts.length > 0 ? ` 적용 필터: ${parts.join(", ")}.` : ""
  }`;
  const og = new URL(ogPath(scope, f), siteUrl()).href;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: analysisPath(scope, null) },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_NAME,
      title,
      description,
      url: analysisPath(scope, f),
      images: [{ url: og, width: 1200, height: 630, alt: `${name} 상권 분석` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

async function AnalysisData({ searchParams }: { searchParams: PageProps<"/analysis">["searchParams"] }) {
  const raw = await searchParams;
  const { scope, fellBack } = parseScope(raw);
  // 전부 실패하면 loadArea가 throw하고 error.tsx가 받는다. 빈 결과(0곳)는 화면이 따로 그린다.
  const dataset = await loadArea(loadInput(scope));
  return <AnalysisView dataset={dataset} scope={scope} initialFilters={parseFilters(raw)} fellBack={fellBack} />;
}

function Skeleton() {
  return (
    <div className={s.inner} aria-busy="true">
      <p className={s.eyebrow}>결제 데이터를 불러오는 중입니다.</p>
      <div className={s.skeleton} />
      <div className={s.skeleton} />
    </div>
  );
}

export default function AnalysisPage({ searchParams }: PageProps<"/analysis">) {
  return (
    <main id="main" className={s.page}>
      <Suspense fallback={<Skeleton />}>
        <AnalysisData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
