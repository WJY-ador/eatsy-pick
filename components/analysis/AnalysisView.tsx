"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MerLink } from "@/components/MerLink";
import { StoreMap } from "@/components/StoreMap";
import {
  type FilterKey,
  type Filters,
  type Ratio,
  analyze,
  formatRank,
  hasSelection,
  ratioPercent,
  splitPeak,
  toggleFilter,
} from "@/lib/analytics";
import { customerLabel } from "@/lib/labels";
import type { AreaDataset, Store } from "@/lib/stores";
import { BarChart, PeakTable } from "./Charts";
import { type Scope, analysisPath, receiptHref } from "./scope";
import { ShareButton } from "./ShareButton";
import s from "./analysis.module.css";

const CATEGORY_LIMIT = 12;

function peakText(key: string): string {
  const { day, time } = splitPeak(key);
  return `${day} ${time}`;
}

function RatioKpi({ label, ratio }: { label: string; ratio: Ratio }) {
  const pct = ratioPercent(ratio);
  return (
    <div className={s.kpi}>
      <dt>{label}</dt>
      <dd className={s.num}>
        <span className={s.kpiValue}>{pct === null ? "정보 없음" : `${pct}%`}</span>
        <span className={s.kpiSub}>
          {ratio.den === 0 ? "값이 확인된 매장 0곳" : `${ratio.num}곳 / 값 확인 ${ratio.den}곳`}
        </span>
      </dd>
    </div>
  );
}

function storeMeta(st: Store): string {
  const rank = st.ccgRank === null ? "시군구 순위 정보 없음" : `${st.sigungu} 상위 ${formatRank(st.ccgRank)}`;
  const peak = st.peakDay && st.peakTime ? `피크 ${st.peakDay} ${st.peakTime}` : "피크 정보 없음";
  return `${st.category}, ${rank}, ${peak}`;
}

export function AnalysisView({
  dataset,
  scope,
  initialFilters,
  fellBack,
}: {
  dataset: AreaDataset;
  scope: Scope;
  initialFilters: Filters;
  fellBack: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allCats, setAllCats] = useState(false);

  const a = useMemo(() => analyze(dataset.stores, filters), [dataset.stores, filters]);
  const applied = a.filters;
  const path = analysisPath(scope, applied);

  // 필터 상태는 URL에 둔다. replaceState만 쓰므로 서버 왕복과 API 재호출이 없다.
  useEffect(() => {
    const now = `${window.location.pathname}${window.location.search}`;
    if (now !== path) window.history.replaceState(null, "", path);
  }, [path]);

  const pick = (key: FilterKey) => (value: string) => setFilters(toggleFilter(applied, key, value));
  const clearAll = () => setFilters({ ...applied, cat: null, peak: null, cust: null });
  const selected = selectedId && a.filtered.some((st) => st.id === selectedId) ? selectedId : null;
  const onMap = a.filtered.filter((st) => st.lat !== null && st.lng !== null).length;
  const top = a.kpis.topCustomer;
  const empty = dataset.stores.length === 0;

  const chips: { key: FilterKey; text: string }[] = [];
  if (applied.cat) chips.push({ key: "cat", text: `업종 ${applied.cat}` });
  if (applied.peak) chips.push({ key: "peak", text: `피크 ${peakText(applied.peak)}` });
  if (applied.cust) chips.push({ key: "cust", text: `고객층 ${customerLabel(applied.cust)}` });

  return (
    <div className={s.inner}>
      <section className={s.panel} aria-labelledby="analysis-title">
        <h1 id="analysis-title" className={s.h1}>
          {dataset.title} 상권 분석
        </h1>
        <dl className={s.facts}>
          <div className={s.fact}>
            <dt>실제 조회 범위</dt>
            <dd data-testid="scope">{dataset.scopeLabel}</dd>
          </div>
          <div className={s.fact}>
            <dt>API 반환</dt>
            <dd data-testid="returned">{dataset.returned}곳</dd>
          </div>
          <div className={s.fact}>
            <dt>필터 적용 후</dt>
            <dd data-testid="filtered">{a.filtered.length}곳</dd>
          </div>
        </dl>
        {fellBack ? <p className={s.notice}>알 수 없는 상권이라 강남역을 보여 줍니다.</p> : null}
        {dataset.hitLimit ? (
          <p className={s.notice} data-testid="hit-limit">
            호출당 100곳 반환 한도에 도달했습니다. 범위 안 전체 매장이 아닙니다.
          </p>
        ) : null}
        {dataset.failed > 0 ? (
          <p className={s.notice} data-testid="partial">
            조회 {dataset.queries.length}건 중 {dataset.failed}건이 실패해 일부 결과만 보여 줍니다.
          </p>
        ) : null}
        <p className={s.caption}>
          API 반환 수는 중복 정리 전 건수입니다. 분석은 정리 뒤 {dataset.stores.length}곳에서 계산합니다.
        </p>
        {!empty ? (
          <>
            <div className={s.controls}>
              <button
                type="button"
                role="switch"
                aria-checked={applied.fr}
                className={`${s.btn} ${applied.fr ? s.switchOn : ""}`}
                onClick={() => setFilters({ ...applied, fr: !applied.fr })}
              >
                <span className={s.switchTrack} aria-hidden="true" />
                프랜차이즈 제외
                <span className={s.num}>({a.franchiseCount}곳)</span>
              </button>
              <button type="button" className={s.btn} onClick={clearAll} disabled={!hasSelection(applied)}>
                필터 모두 해제
              </button>
              <ShareButton path={path} />
            </div>
            {chips.length > 0 ? (
              <div className={s.chips} aria-label="적용한 필터">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={s.chip}
                    aria-label={`${c.text} 필터 해제`}
                    onClick={() => setFilters({ ...applied, [c.key]: null })}
                  >
                    {c.text} 해제
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {empty ? (
        <section className={s.panel}>
          <h2 className={s.h2}>조회된 매장이 없습니다</h2>
          <p className={s.empty}>
            {dataset.scopeLabel} 범위에서 API가 돌려준 매장이 없습니다. 조회는 성공했습니다. 다른 동네나 상권을 골라 주세요.
          </p>
        </section>
      ) : (
        <>
          <section className={s.panel} aria-label="핵심 지표">
            <dl className={s.kpis} data-testid="kpis">
              <div className={s.kpi}>
                <dt>분석 매장 수</dt>
                <dd>
                  <span className={`${s.kpiValue} ${s.num}`} data-testid="kpi-count">
                    {a.kpis.count}곳
                  </span>
                  <span className={s.kpiSub}>프랜차이즈 {applied.fr ? "제외" : "포함"}, 필터 적용</span>
                </dd>
              </div>
              <RatioKpi label="동네맛집 표시 비중" ratio={a.kpis.local} />
              <RatioKpi label="회식 적합 표시 비중" ratio={a.kpis.hoesik} />
              <div className={s.kpi}>
                <dt>가장 많은 1위 고객층</dt>
                <dd>
                  <span className={`${s.kpiValue} ${s.kpiValueText}`}>
                    {top ? top.leaders.map(customerLabel).join(", ") : "정보 없음"}
                  </span>
                  <span className={s.kpiSub}>{top ? `1위인 매장 ${top.num}곳 / 고객층 확인 ${top.den}곳` : "고객층이 확인된 매장 0곳"}</span>
                </dd>
              </div>
            </dl>
          </section>

          <div className={s.body}>
            <div className={s.charts}>
              <section className={s.panel} aria-labelledby="peak-title">
                <h2 id="peak-title" className={s.h2}>
                  요일, 시간대별 대표 피크
                </h2>
                <p className={s.caption}>셀 숫자는 그 요일, 시간대가 가장 붐비는 때로 집계된 매장 수입니다. 실시간 혼잡도가 아닙니다.</p>
                <PeakTable grid={a.peak} selected={applied.peak} onPick={pick("peak")} />
              </section>

              <section className={s.panel} aria-labelledby="cust-title">
                <h2 id="cust-title" className={s.h2}>
                  주 고객층
                </h2>
                <p className={s.caption}>
                  고객층 1~3위에 그 고객층이 들어간 매장 수입니다. 유효 표본{" "}
                  <span className={s.num}>{a.customers.sample}곳</span>. 한 매장이 막대 여러 개에 들어갈 수 있습니다.
                </p>
                <BarChart name="cust" bars={a.customers.bars} selected={applied.cust} onPick={pick("cust")} label={customerLabel} />
              </section>

              <section className={s.panel} aria-labelledby="cat-title">
                <h2 id="cat-title" className={s.h2}>
                  업종별 매장 수
                </h2>
                <p className={s.caption}>막대를 누르면 지도, 목록, 지표, 다른 차트가 같이 바뀝니다. 다시 누르면 해제합니다.</p>
                <BarChart
                  name="cat"
                  bars={a.categories}
                  selected={applied.cat}
                  onPick={pick("cat")}
                  label={(k) => k}
                  limit={CATEGORY_LIMIT}
                  expanded={allCats}
                  onExpand={() => setAllCats((v) => !v)}
                  moreLabel={(n) => `그 밖 ${n}개 업종 펼치기`}
                />
              </section>
            </div>

            <div className={s.side}>
              <section className={s.panel} aria-labelledby="map-title">
                <h2 id="map-title" className={s.h2}>
                  지도
                </h2>
                <p className={s.mapMeta}>
                  매장 {a.filtered.length}곳 중 좌표가 있는 {onMap}곳을 지도에 표시합니다.
                </p>
                <div className={s.mapBox} data-testid="map" data-map-count={a.filtered.length}>
                  <StoreMap stores={a.filtered} selectedId={selected} onSelect={setSelectedId} me={null} height={320} />
                </div>
              </section>

              <section className={s.panel} aria-labelledby="list-title">
                <h2 id="list-title" className={s.h2}>
                  매장 목록 <span className={s.num}>{a.filtered.length}곳</span>
                </h2>
                <p className={s.caption}>API 순서(시군구 매출 상위 순)입니다. 매장 이름을 누르면 결제 영수증으로 갑니다.</p>
                {a.filtered.length === 0 ? (
                  <div>
                    <p className={s.empty}>
                      {a.base.length === 0 ? "프랜차이즈를 빼면 남는 매장이 없습니다." : "지금 고른 조건에 맞는 매장이 없습니다."}
                    </p>
                    {hasSelection(applied) ? (
                      <button type="button" className={s.more} onClick={clearAll}>
                        필터 모두 해제
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <ul className={s.list} data-testid="store-list">
                    {a.filtered.map((st) => (
                      <li key={st.id} className={s.row} data-store-id={st.id} data-selected={st.id === selected}>
                        <Link className={s.rowName} href={receiptHref(scope, st)} prefetch={false}>
                          {st.name}
                        </Link>
                        <p className={s.rowMeta}>{storeMeta(st)}</p>
                        <MerLink merUrl={st.merUrl ?? undefined} className={s.cta} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
