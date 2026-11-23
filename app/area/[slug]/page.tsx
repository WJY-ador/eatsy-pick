import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RankTable } from "@/components/RankTable";
import { areaBySlug } from "@/lib/areas";
import { searchCached6h } from "@/lib/cached";
import { radiusLabel } from "@/lib/format";
import { areaReport } from "@/lib/report";
import { SITE_NAME } from "@/lib/site";

export const maxDuration = 30;

// 빌드 때는 강남역 하나만 만든다(프록시 제한). 나머지는 첫 요청 때 만들고 6시간 캐시한다.
export async function generateStaticParams() {
  return [{ slug: "gangnam" }];
}

export async function generateMetadata({ params }: PageProps<"/area/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const area = areaBySlug(slug);
  if (!area) notFound();
  const title = `${area.name} 업종별 결제 랭킹 | ${SITE_NAME}`;
  const description = `${area.name} 근처 고기구이, 한식, 일식, 호프, 국수, 카페의 시군구 매출 상위 가게를 BC카드 결제 데이터로 봅니다.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/area/${area.slug}` },
    openGraph: { title, description, url: `/area/${area.slug}` },
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

  return (
    <>
      <h1 className="report__h">{area.name} 업종별 결제 랭킹</h1>
      <p className="report__lede">
        {area.centerName} 근처 가게를 업종별로 시군구 매출 순위가 높은 순서로 5곳씩 보여 줍니다. 프랜차이즈는 뒤로 내렸습니다.
      </p>
      <p className="report__cta">
        <Link className="btn btn--primary" prefetch={false} href={`/?${new URLSearchParams({ area: area.slug }).toString()}`}>
          이 상권 지도에서 고르기
        </Link>
      </p>
      {r.groups.map((g) => (
        <section key={g.group.slug} className="report__group" aria-labelledby={`g-${g.group.slug}`}>
          <div className="report__ghead">
            <h2 id={`g-${g.group.slug}`} className="report__gh">
              {g.group.name}
            </h2>
            <p className="report__gmeta">
              {area.centerName} {radiusLabel(g.radius)}, {g.group.categories[0]} 기준
            </p>
          </div>
          {g.rows.length > 0 ? (
            <RankTable rows={g.rows} caption={`${area.name} ${g.group.name} 결제 순위 상위 ${g.rows.length}곳`} />
          ) : (
            <p className="report__empty">이 업종의 결제 데이터가 이 상권에서 조회되지 않았습니다.</p>
          )}
          <a className="link" href={`/area/${area.slug}/${g.group.slug}`}>
            {g.group.name} 20곳과 분포 보기
          </a>
        </section>
      ))}
    </>
  );
}

function ReportSkeleton() {
  return (
    <div aria-busy="true">
      <p className="report__h">결제 데이터를 모으는 중입니다.</p>
      {[1, 2, 3].map((i) => (
        <div key={i} className="report__group" aria-hidden="true">
          <span className="skel skel--name" />
          <span className="skel skel--line" />
          <span className="skel skel--line" />
          <span className="skel skel--line" />
        </div>
      ))}
    </div>
  );
}

export default function AreaPage({ params }: PageProps<"/area/[slug]">) {
  return (
    <main id="main" className="report container">
      <nav className="crumbs" aria-label="위치">
        <Link prefetch={false} href="/area">상권별 결제 랭킹</Link>
      </nav>
      <Suspense fallback={<ReportSkeleton />}>
        <Report params={params} />
      </Suspense>
    </main>
  );
}
