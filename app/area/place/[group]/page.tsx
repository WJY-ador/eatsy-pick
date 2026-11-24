import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { resolvePlaceCached } from "@/components/area/cached";
import { type PlaceSearchParams, readPlace } from "@/components/area/place-params";
import { GroupReportBody, GroupSkeleton } from "@/components/area/ReportViews";
import { searchCached6h } from "@/lib/cached";
import { groupBySlug, groupReport } from "@/lib/report";
import { SITE_NAME, shareImages, shareTwitterImages } from "@/lib/site";

export const maxDuration = 30;

// 직접 추가한 지역의 업종별 랭킹. 주소 /area/place/<업종>?q=..&k=..
export async function generateStaticParams() {
  return [{ group: "gogi" }];
}

type Props = { params: Promise<{ group: string }>; searchParams: PlaceSearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { group: g } = await params;
  const group = groupBySlug(g);
  if (!group) notFound();
  const p = await readPlace(searchParams);
  if (!p) notFound();
  // 키가 맞는 지역이 없으면 404. 카카오 조회 실패는 본문의 오류 경계가 다루므로 여기서는 이름만 비운다.
  const v = await resolvePlaceCached(p.q, p.k).catch(() => undefined);
  if (v === null) notFound();
  const name = v?.title ?? "직접 추가한 지역";
  const title = `${name} ${group.name} 결제 랭킹 | ${SITE_NAME}`;
  const description = `${name} ${group.name} 가게의 시군구 매출 순위와 붐비는 요일, 시간대, 주 고객층 분포를 BC카드 결제 데이터로 봅니다.`;
  // openGraph와 twitter는 layout 값을 통째로 덮으므로 type, locale, siteName도 함께 적는다.
  return {
    title: { absolute: title },
    description,
    robots: { index: false },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title, description, images: shareImages(title) },
    twitter: { card: "summary_large_image", title, description, images: shareTwitterImages(title) },
  };
}

async function GroupBody({ params, searchParams }: Props) {
  const { group: g } = await params;
  const group = groupBySlug(g);
  const p = await readPlace(searchParams);
  if (!group || !p) notFound();
  const v = await resolvePlaceCached(p.q, p.k);
  if (!v) notFound();
  const r = await groupReport(v.area, group, searchCached6h, v.opts);
  if (r.calls.failed > 0) throw new Error(`place group report upstream failed ${r.calls.failed}/${r.calls.planned}`);
  return <GroupReportBody v={v} r={r} />;
}

export default function PlaceGroupPage(props: Props) {
  return (
    <main id="main" className="report container">
      <Suspense fallback={<GroupSkeleton />}>
        <GroupBody {...props} />
      </Suspense>
    </main>
  );
}
