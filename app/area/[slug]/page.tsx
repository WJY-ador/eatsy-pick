import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AreaReportBody, ReportSkeleton } from "@/components/area/ReportViews";
import { presetView } from "@/components/area/view";
import { areaBySlug } from "@/lib/areas";
import { searchCached6h } from "@/lib/cached";
import { areaReport } from "@/lib/report";
import { SITE_NAME, shareImages, shareTwitterImages } from "@/lib/site";

export const maxDuration = 30;

// 빌드 때는 강남역 하나만 만든다(프록시 제한). 나머지는 첫 요청 때 만들고 6시간 캐시한다.
// 내 상권 목록에서 지운 상권도 이 주소는 그대로 열린다(목록은 기기 저장일 뿐이다).
export async function generateStaticParams() {
  return [{ slug: "gangnam" }];
}

export async function generateMetadata({ params }: PageProps<"/area/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const area = areaBySlug(slug);
  if (!area) notFound();
  const title = `${area.name} 업종별 결제 랭킹 | ${SITE_NAME}`;
  const description = `${area.name} 근처 고기구이, 한식, 일식, 호프, 국수, 카페의 시군구 매출 상위 가게를 BC카드 결제 데이터로 봅니다.`;
  const url = `/area/${area.slug}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title, description, url, images: shareImages(title) },
    twitter: { card: "summary_large_image", title, description, images: shareTwitterImages(title) },
  };
}

async function Report({ params }: { params: PageProps<"/area/[slug]">["params"] }) {
  const { slug } = await params;
  const area = areaBySlug(slug);
  if (!area) notFound();
  const r = await areaReport(area, searchCached6h);
  // 조회가 하나라도 실패하면 이 렌더를 버린다(오류 경계로). 실패한 화면이 6시간 캐시에 남지 않게 하려는 것이다.
  // 성공한 조회는 'use cache'에 남으니 다시 시도하면 실패한 것만 다시 부른다.
  if (r.calls.failed > 0) throw new Error(`area report upstream failed ${r.calls.failed}/${r.calls.planned}`);
  return <AreaReportBody v={presetView(area)} r={r} />;
}

export default function AreaPage({ params }: PageProps<"/area/[slug]">) {
  return (
    <main id="main" className="report container">
      <Suspense fallback={<ReportSkeleton />}>
        <Report params={params} />
      </Suspense>
    </main>
  );
}
