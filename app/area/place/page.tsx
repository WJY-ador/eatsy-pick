import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { resolvePlaceCached } from "@/components/area/cached";
import { type PlaceSearchParams, readPlace } from "@/components/area/place-params";
import { AreaReportBody, ReportSkeleton } from "@/components/area/ReportViews";
import { searchCached6h } from "@/lib/cached";
import { areaReport } from "@/lib/report";
import { SITE_NAME, shareImages, shareTwitterImages } from "@/lib/site";

export const maxDuration = 30;

// 직접 추가한 지역의 상권 랭킹. 주소 /area/place?q=<검색어>&k=<지역 키>만으로 서버가 지역을 다시 풀어 공유할 수 있다.
// 기본 상권 페이지(/area/[slug], 정적 + 6시간 캐시)와 따로 둬서 그쪽을 쿼리 읽기로 동적으로 만들지 않는다.

type Props = { searchParams: PlaceSearchParams };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = await readPlace(searchParams);
  if (!p) notFound();
  // 키가 맞는 지역이 없으면 404. 카카오 조회 실패는 본문의 오류 경계가 다루므로 여기서는 이름만 비운다.
  const v = await resolvePlaceCached(p.q, p.k).catch(() => undefined);
  if (v === null) notFound();
  const name = v?.title ?? "직접 추가한 지역";
  const title = `${name} 업종별 결제 랭킹 | ${SITE_NAME}`;
  const description = `${name}의 고기구이, 한식, 일식, 호프, 국수, 카페 시군구 매출 상위 가게를 BC카드 결제 데이터로 봅니다.`;
  // openGraph와 twitter는 layout 값을 통째로 덮으므로 type, locale, siteName도 함께 적는다.
  return {
    title: { absolute: title },
    description,
    robots: { index: false },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title, description, images: shareImages(title) },
    twitter: { card: "summary_large_image", title, description, images: shareTwitterImages(title) },
  };
}

async function Report({ searchParams }: Props) {
  const p = await readPlace(searchParams);
  if (!p) notFound();
  const v = await resolvePlaceCached(p.q, p.k);
  if (!v) notFound();
  const r = await areaReport(v.area, searchCached6h, v.opts);
  // 조회가 하나라도 실패하면 오류 경계로 보낸다(기본 상권 페이지와 같은 규칙).
  if (r.calls.failed > 0) throw new Error(`place report upstream failed ${r.calls.failed}/${r.calls.planned}`);
  return <AreaReportBody v={v} r={r} />;
}

export default function PlacePage({ searchParams }: Props) {
  return (
    <main id="main" className="report container">
      <Suspense fallback={<ReportSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
