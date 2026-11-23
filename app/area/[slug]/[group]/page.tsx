import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RankTable } from "@/components/RankTable";
import { areaBySlug } from "@/lib/areas";
import { searchCached6h } from "@/lib/cached";
import { radiusLabel } from "@/lib/format";
import { MIN_SAMPLE, type Tally, groupBySlug, groupReport } from "@/lib/report";
import { SITE_NAME } from "@/lib/site";

export const maxDuration = 30;

const DAY_FULL: Record<string, string> = { 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일", 일: "일요일" };

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
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

function TallyLine({ t, map }: { t: Tally; map?: Record<string, string> }) {
  return <>{t.slice(0, 3).map((x) => `${map?.[x.label] ?? x.label} ${x.count}곳`).join(", ")}</>;
}

async function GroupBody({ params }: { params: PageProps<"/area/[slug]/[group]">["params"] }) {
  const { slug, group: g } = await params;
  const area = areaBySlug(slug);
  const group = groupBySlug(g);
  if (!area || !group) notFound();
  const r = await groupReport(area, group, searchCached6h);
  // 조회가 하나라도 실패하면 이 렌더를 버린다(오류 경계로). 실패한 화면이 6시간 캐시에 남지 않게 하려는 것이다.
  if (r.calls.failed > 0) throw new Error(`group report upstream failed ${r.calls.failed}/${r.calls.planned}`);

  return (
    <>
      <nav className="crumbs" aria-label="위치">
        <Link href="/area">상권별 결제 랭킹</Link>
        <span aria-hidden="true"> / </span>
        <a href={`/area/${area.slug}`}>{area.name}</a>
      </nav>
      <h1 className="report__h">
        {area.name} {group.name} 결제 랭킹
      </h1>
      <p className="report__lede">
        {area.centerName} {radiusLabel(r.radius)} {group.categories.join(", ")} 가게를 시군구 매출 순위가 높은 순서로 보여 줍니다. 프랜차이즈는 뒤로 내렸습니다.
      </p>
      <p className="report__cta">
        <a className="btn btn--primary" href={`/?area=${area.slug}&occ=hoesik`}>
          이 상권에서 모임 자리 3곳 고르기
        </a>
      </p>

      {r.summary ? (
        <section className="report__group" aria-labelledby="sum-h">
          <h2 id="sum-h" className="report__gh">
            표본 {r.sample}곳에서 센 분포
          </h2>
          <dl className="facts facts--wide">
            <div>
              <dt>가장 붐비는 요일</dt>
              <dd>
                <TallyLine t={r.summary.days} map={DAY_FULL} />
              </dd>
            </div>
            <div>
              <dt>가장 붐비는 시간대</dt>
              <dd>
                <TallyLine t={r.summary.times} />
              </dd>
            </div>
            <div>
              <dt>주 고객층 1위</dt>
              <dd>
                <TallyLine t={r.summary.customers} />
              </dd>
            </div>
          </dl>
          <p className="report__gmeta">표본 {r.sample}곳 기준. 가게마다 가장 붐비는 요일, 시간대, 주 고객층 1위를 하나씩 셌습니다.</p>
        </section>
      ) : (
        <p className="report__note">표본이 {MIN_SAMPLE}곳 미만이라 분포 요약을 내지 않습니다.</p>
      )}
      <section className="report__group" aria-labelledby="tbl-h">
        <h2 id="tbl-h" className="report__gh">
          시군구 매출 상위 {r.rows.length}곳
        </h2>
        {r.rows.length > 0 ? (
          <RankTable rows={r.rows} caption={`${area.name} ${group.name} 결제 순위 상위 ${r.rows.length}곳`} />
        ) : (
          <p className="report__empty">이 업종의 결제 데이터가 이 상권에서 조회되지 않았습니다.</p>
        )}
      </section>
    </>
  );
}

export default function GroupPage({ params }: PageProps<"/area/[slug]/[group]">) {
  return (
    <main id="main" className="report container">
      <Suspense
        fallback={
          <div aria-busy="true">
            <p className="report__h">결제 데이터를 모으는 중입니다.</p>
            <span className="skel skel--line" />
            <span className="skel skel--line" />
          </div>
        }
      >
        <GroupBody params={params} />
      </Suspense>
    </main>
  );
}
