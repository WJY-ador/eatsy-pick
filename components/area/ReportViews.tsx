// 상권 랭킹과 업종별 랭킹 본문. 기본 상권(/area/[slug])과 직접 추가한 지역(/area/place)이 같이 쓴다. 서버 컴포넌트.
// 가게 순위는 RankTable 카드형 목록으로 그린다. 참고 이미지 안내와 대표 피크 뜻은 페이지 첫 목록 위에 한 번만 둔다(RankNote).
// 지도와 영수증에 넘길 매장은 여기서 랭킹 행을 Store로 바꿔 props로 넘긴다(지도를 열 때 다시 조회하지 않는다).

import Link from "next/link";
import { RankTable } from "@/components/RankTable";
import { radiusLabel } from "@/lib/format";
import { type AreaReport, type GroupReport, MIN_SAMPLE, type Row, type Tally } from "@/lib/report";
import { type Store, toStore } from "@/lib/stores";
import { AreaMapPanel } from "./AreaMapPanel";
import { AreaSwitch } from "./AreaSwitch";
import { type AreaView, viewHref } from "./view";

const DAY_FULL: Record<string, string> = { 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일", 일: "일요일" };

/** 여러 목록에 나온 매장은 매장 ID로 하나만(처음 나온 순서) */
function storesOf(rows: Row[]): Store[] {
  const m = new Map<string, Store>();
  for (const r of rows) {
    const s = toStore(r.item);
    if (!m.has(s.id)) m.set(s.id, s);
  }
  return [...m.values()];
}

/** 목록 위 범위 문구. 역과 기본 상권은 중심과 반경, 구와 동은 주소 범위 전체 */
function scopeLine(v: AreaView, radius: number | null): string {
  return v.scopeName ?? `${v.centerName} ${radiusLabel(radius)}`;
}

function Crumbs({ v, group }: { v: AreaView; group?: boolean }) {
  return (
    <nav className="crumbs" aria-label="위치">
      <Link prefetch={false} href="/area">
        상권별 결제 랭킹
      </Link>
      {group ? (
        <>
          <span aria-hidden="true"> / </span>
          <a href={viewHref(v)}>{v.title}</a>
        </>
      ) : null}
    </nav>
  );
}

/** 썸네일이 실제 매장 사진이 아니라는 안내(홈 Curation.tsx와 같은 문구)와 대표 피크 띠의 뜻. 페이지에 한 번 */
function RankNote() {
  return (
    <>
      <p className="catimg-note">사진은 업종 참고 이미지입니다</p>
      <p className="catimg-note">대표 피크는 최근 1개월 결제로 본 가장 붐비는 요일과 시간대입니다</p>
    </>
  );
}

function PlaceNote({ v }: { v: AreaView }) {
  if (v.kind === "preset") return null;
  return (
    <p className="report__gmeta area-place">
      {v.kind === "station"
        ? `${v.title} 주소 ${v.address}. 결제 데이터 조회 범위 ${v.area.dongs.join(", ")}.`
        : `${v.address} 전체를 조회합니다. 중심 반경으로 줄이지 않습니다.`}
    </p>
  );
}

export function AreaReportBody({ v, r }: { v: AreaView; r: AreaReport }) {
  const rows = r.groups.flatMap((g) => g.rows);
  const firstListed = r.groups.findIndex((g) => g.rows.length > 0);
  const lede =
    v.kind === "region"
      ? `${v.scopeName?.replace(/ 전체$/, "")} 주소의 가게를 업종별로 시군구 매출 순위가 높은 순서로 5곳씩 보여 줍니다. 프랜차이즈는 뒤로 내렸습니다.`
      : `${v.centerName} 근처 가게를 업종별로 시군구 매출 순위가 높은 순서로 5곳씩 보여 줍니다. 프랜차이즈는 뒤로 내렸습니다.`;
  return (
    <>
      <Crumbs v={v} />
      <h1 className="report__h">{v.title} 업종별 결제 랭킹</h1>
      <p className="report__lede">{lede}</p>
      <PlaceNote v={v} />
      <AreaSwitch currentKey={v.key} currentName={v.title} group={null} />
      <AreaMapPanel stores={storesOf(rows)} center={v.center} centerName={v.centerName} what="이 랭킹에 실린 매장" />
      {r.groups.map((g, gi) => (
        <section key={g.group.slug} className="report__group" aria-labelledby={`g-${g.group.slug}`}>
          <div className="report__ghead">
            <h2 id={`g-${g.group.slug}`} className="report__gh">
              {g.group.name}
            </h2>
            <p className="report__gmeta">
              {scopeLine(v, g.radius)}, {g.group.categories[0]} 기준
            </p>
            {gi === firstListed ? <RankNote /> : null}
          </div>
          {g.rows.length > 0 ? (
            <RankTable rows={g.rows} caption={`${v.title} ${g.group.name} 결제 순위 상위 ${g.rows.length}곳`} />
          ) : (
            <p className="report__empty">이 업종의 결제 데이터가 이 상권에서 조회되지 않았습니다.</p>
          )}
          {/* 업종 페이지는 업종 최대 2개, 동 최대 3개로 따로 조회해 이 칸과 수가 다르다. 수를 쓰지 않는다.
              이 칸이 0곳이면 링크를 뺀다(2026-11-24 하동역 실측: 빈 칸의 업종 페이지도 둘째 업종까지 0곳). */}
          {g.rows.length > 0 ? (
            <a className="link" href={viewHref(v, g.group.slug)}>
              {g.group.name} 자세히 보기
            </a>
          ) : null}
        </section>
      ))}
    </>
  );
}

function TallyLine({ t, map }: { t: Tally; map?: Record<string, string> }) {
  return <>{t.slice(0, 3).map((x) => `${map?.[x.label] ?? x.label} ${x.count}곳`).join(", ")}</>;
}

export function GroupReportBody({ v, r }: { v: AreaView; r: GroupReport }) {
  const group = r.group;
  const where = v.kind === "region" ? `${v.scopeName?.replace(/ 전체$/, "")} 주소의` : `${v.centerName} ${radiusLabel(r.radius)}`;
  return (
    <>
      <Crumbs v={v} group />
      <h1 className="report__h">
        {v.title} {group.name} 결제 랭킹
      </h1>
      <p className="report__lede">
        {where} {group.categories.join(", ")} 가게를 시군구 매출 순위가 높은 순서로 보여 줍니다. 프랜차이즈는 뒤로 내렸습니다.
      </p>
      <PlaceNote v={v} />
      <AreaSwitch currentKey={v.key} currentName={v.title} group={group.slug} />
      <AreaMapPanel stores={storesOf(r.rows)} center={v.center} centerName={v.centerName} what={`${group.name} 랭킹 매장`} />

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
        <div className="report__ghead">
          <h2 id="tbl-h" className="report__gh">
            시군구 매출 상위 {r.rows.length}곳
          </h2>
          {r.rows.length > 0 ? <RankNote /> : null}
        </div>
        {r.rows.length > 0 ? (
          <RankTable rows={r.rows} caption={`${v.title} ${group.name} 결제 순위 상위 ${r.rows.length}곳`} />
        ) : (
          <p className="report__empty">이 업종의 결제 데이터가 이 상권에서 조회되지 않았습니다.</p>
        )}
      </section>
    </>
  );
}

export function ReportSkeleton() {
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

export function GroupSkeleton() {
  return (
    <div aria-busy="true">
      <p className="report__h">결제 데이터를 모으는 중입니다.</p>
      <span className="skel skel--line" />
      <span className="skel skel--line" />
    </div>
  );
}
