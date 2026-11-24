import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GroupReportBody, GroupSkeleton } from "@/components/area/ReportViews";
import { presetView } from "@/components/area/view";
import { areaBySlug } from "@/lib/areas";
import { searchCached6h } from "@/lib/cached";
import { groupBySlug, groupReport } from "@/lib/report";
import { SITE_NAME, shareImages, shareTwitterImages } from "@/lib/site";

export const maxDuration = 30;

// 빌드 때는 강남역 고기구이 하나만 만든다(프록시 제한).
export async function generateStaticParams() {
  return [{ group: "gogi" }];
}

export async function generateMetadata({ params }: PageProps<"/area/[slug]/[group]">): Promise<Metadata> {
  const { slug, group: g } = await params;
  const area = areaBySlug(slug);
  const group = groupBySlug(g);
  if (!area || !group) notFound();
  const title = `${area.name} ${group.name} 결제 랭킹 | ${SITE_NAME}`;
  const description = `${area.name} 근처 ${group.name} 가게 20곳의 시군구 매출 순위와 붐비는 요일, 시간대, 주 고객층 분포를 BC카드 결제 데이터로 봅니다.`;
  const url = `/area/${area.slug}/${group.slug}`;
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, images: shareImages(title) }, twitter: { card: "summary_large_image", title, description, images: shareTwitterImages(title) } };
}

async function GroupBody({ params }: { params: PageProps<"/area/[slug]/[group]">["params"] }) {
  const { slug, group: g } = await params;
  const area = areaBySlug(slug);
  const group = groupBySlug(g);
  if (!area || !group) notFound();
  const r = await groupReport(area, group, searchCached6h);
  // 조회가 하나라도 실패하면 이 렌더를 버린다(오류 경계로). 실패한 화면이 6시간 캐시에 남지 않게 하려는 것이다.
  if (r.calls.failed > 0) throw new Error(`group report upstream failed ${r.calls.failed}/${r.calls.planned}`);
  return <GroupReportBody v={presetView(area)} r={r} />;
}

export default function GroupPage({ params }: PageProps<"/area/[slug]/[group]">) {
  return (
    <main id="main" className="report container">
      <Suspense fallback={<GroupSkeleton />}>
        <GroupBody params={params} />
      </Suspense>
    </main>
  );
}
