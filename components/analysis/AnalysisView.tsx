"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MerLink } from "@/components/MerLink";
import { StoreMap } from "@/components/StoreMap";
import { Receipt } from "@/components/home/Receipt";
import {
  type Flag,
  type FilterKey,
  type Filters,
  type Ratio,
  type Summary,
  analyze,
  c1Label,
  cellKey,
  cellOf,
  formatRank,
  hasFlag,
  hasSelection,
  parseFilters,
  ratioPercent,
  splitPeak,
  toggleFilter,
  toggleFlag,
} from "@/lib/analytics";
import { customerLabel, peakLabel } from "@/lib/labels";
import { displayName } from "@/lib/store-view";
import type { AreaDataset, Store } from "@/lib/stores";
import { holdTop } from "@/lib/top-fold";
import { tidyUrl } from "@/lib/utm";
import { PeakTable } from "./Charts";
import { useHelp } from "./Help";
import { PyramidChart } from "./Pyramid";
import { Treemap } from "./Treemap";
import { type Scope, PAGE_INTRO, analysisPath, foodLabel, pageTitle, receiptHref, scopeFilters } from "./scope";
import { ShareButton } from "./ShareButton";
import s from "./analysis.module.css";

/** 매장 목록은 처음에 이만큼 보이고, 더 보기를 누를 때마다 이만큼 늘린다 */
const LIST_STEP = 5;

function peakText(key: string): string {
  const { day, time } = splitPeak(key);
  return `${day} ${time}`;
}

const FLAG_NAME: Record<Flag, string> = { local: "동네맛집", hoesik: "회식 적합" };
/** 뜻 글. 영수증 배지 도움말과 같은 정의다 */
const FLAG_HELP: Record<Flag, string> = {
  local: "동네 고객 비율이 시군구 평균보다 높은 매장입니다.",
  hoesik: "저녁 시간대 단체 결제 이력이 있는 매장입니다.",
};

/** 앞말 끝 글자에 받침이 있으면 받침용 조사, 없으면 다른 조사. 한글이 아니면 받침용으로 본다 */
function josa(word: string, withFinal: string, without: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return withFinal;
  return code % 28 === 0 ? without : withFinal;
}

/** 요약 줄에 이름을 다 적는 동률 수. 넘으면 "외 N개"로 줄인다 */
const SUMMARY_NAMES = 3;

function namesText(keys: string[], label: (k: string) => string, unit: string): string {
  const head = keys.slice(0, SUMMARY_NAMES).map(label).join(", ");
  return keys.length > SUMMARY_NAMES ? `${head} 외 ${keys.length - SUMMARY_NAMES}개 ${unit}` : head;
}

function peakFull(key: string): string {
  const { day, time } = splitPeak(key);
  return peakLabel(day, time) ?? key;
}

/**
 * 요약 줄. 현재 조건에 맞는 매장(지도, 목록과 같은 집합) 중 대표 피크 최빈 조합과 원본 rk01 최빈 고객층을 매장 수로 쓴다.
 * 짧은 한 문장으로 쓴다. 동률이면 모두 적고 "각각"을 붙인다. 값이 확인된 매장이 없는 구절은 뺀다. 둘 다 없으면 줄을 그리지 않는다.
 * 값이 확인된 매장 수(분모)는 화면에 적지 않고 data-*-den으로만 남긴다.
 * 매장 수일 뿐 고객 비중, 직업, 지금의 혼잡이나 대기를 뜻하지 않는다.
 */
function SummaryLine({ sum }: { sum: Summary }) {
  const { peak, customer } = sum;
  if (!peak && !customer) return null;
  const each = (n: number) => (n > 1 ? "각각 " : "");
  const peakNames = peak ? namesText(peak.leaders, peakFull, "조합") : "";
  const custNames = customer ? namesText(customer.leaders, customerLabel, "고객층") : "";
  return (
    <p
      className={s.summary}
      data-testid="summary-line"
      data-total={sum.total}
      data-peak={peak ? peak.leaders.join("|") : ""}
      data-peak-num={peak?.num ?? ""}
      data-peak-den={peak?.den ?? ""}
      data-cust={customer ? customer.leaders.join("|") : ""}
      data-cust-num={customer?.num ?? ""}
      data-cust-den={customer?.den ?? ""}
    >
      <span className={s.num}>{sum.total}곳</span> 중{" "}
      {peak ? (
        <>
          대표 피크는 <strong>{peakNames}</strong>
          {josa(peakNames, "이", "가")} {each(peak.leaders.length)}
          <span className={s.num}>{peak.num}곳</span>
          {customer ? ", " : "으로 가장 많습니다."}
        </>
      ) : null}
      {customer ? (
        <>
          1위 고객층은 <strong>{custNames}</strong>
          {josa(custNames, "이", "가")} {each(customer.leaders.length)}
          <span className={s.num}>{customer.num}곳</span>으로 가장 많습니다.
        </>
      ) : null}
    </p>
  );
}

type ChartTab = "peak" | "cust" | "cat";
const TABS: { id: ChartTab; name: string }[] = [
  { id: "peak", name: "대표 피크" },
  { id: "cust", name: "손님" },
  { id: "cat", name: "업종" },
];

function FilterIcon(): JSX.Element {
  return (
    <svg className={s.kpiIcon} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg className={s.kpiIcon} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 방문 성격 게이지(동네맛집, 회식 적합). 비율은 해당 매장 수 ÷ 값이 확인된 매장 수, 기준 집합(KPI 조건을 걸기 전)에서 센다.
 * 누르면 그 조건으로 지도와 목록을 좁히고 다시 누르면 푼다. 분모 0은 "정보 없음". 해당 매장이 없으면 켤 수 없고, 켜져 있으면 언제든 끌 수 있다.
 */
function FlagGauge({ flag, ratio, on, onToggle }: { flag: Flag; ratio: Ratio; on: boolean; onToggle: () => void }) {
  const pct = ratioPercent(ratio);
  const help = useHelp(FLAG_NAME[flag], FLAG_HELP[flag]);
  const value = pct === null ? "정보 없음" : `${ratio.num}곳, ${pct}%`;
  return (
    <div className={s.gauge} data-testid="gauge" data-flag={flag}>
      <div className={s.gaugeHead}>
        <span className={s.gaugeName}>{FLAG_NAME[flag]}</span>
        {help.button}
      </div>
      <button
        type="button"
        className={s.gaugeBtn}
        data-testid="kpi-filter"
        data-flag={flag}
        data-num={ratio.num}
        data-den={ratio.den}
        aria-pressed={on}
        aria-label={`${FLAG_NAME[flag]} ${value}${on ? ", 지도와 목록에 적용 중" : ", 누르면 지도와 목록을 좁힙니다"}`}
        disabled={!on && ratio.num === 0}
        onClick={onToggle}
      >
        <span className={s.gaugeTrack} aria-hidden="true">
          <span className={s.gaugeFill} style={{ width: `${pct ?? 0}%` }} />
        </span>
        <span className={`${s.gaugeValue} ${s.num}`}>{value}</span>
        <span className={s.gaugeIcon} aria-hidden="true">
          {on ? <CheckIcon /> : <FilterIcon />}
        </span>
      </button>
      {help.panel}
    </div>
  );
}

function storeMeta(st: Store): string {
  const rank = st.ccgRank === null ? "시군구 순위 정보 없음" : `${st.sigungu} 상위 ${formatRank(st.ccgRank)}`;
  const peak = st.peakDay && st.peakTime ? `피크 ${st.peakDay} ${st.peakTime}` : "피크 정보 없음";
  return `${st.category}, ${rank}, ${peak}`;
}

/**
 * 매장 목록. 받은 순서(시군구 매출 상위 순) 그대로 앞에서부터 LIST_STEP곳씩 보인다.
 * 자르는 건 이 목록뿐이다. 지도, KPI, 결과 건수는 부모가 전체 일치 매장으로 센다.
 * 처음 5곳으로 되돌리는 일은 부모가 key(지역과 적용 필터의 주소)로 다시 그려서 한다.
 */
function StoreList({ stores, scope, selected }: { stores: Store[]; scope: Scope; selected: string | null }) {
  const [limit, setLimit] = useState(LIST_STEP);
  const listRef = useRef<HTMLUListElement>(null);
  const total = stores.length;
  const visible = stores.slice(0, limit);
  const rest = total - visible.length;
  // 새로 붙은 첫 행의 매장 이름으로 포커스를 옮긴다. 마지막에 버튼이 사라져도 포커스가 body로 떨어지지 않는다.
  const showMore = () => {
    const from = visible.length;
    flushSync(() => setLimit(from + LIST_STEP));
    listRef.current?.children[from]?.querySelector<HTMLAnchorElement>("a")?.focus();
  };
  return (
    <>
      <ul ref={listRef} className={s.list} data-testid="store-list">
        {visible.map((st) => (
          <li key={st.id} className={s.row} data-store-id={st.id} data-selected={st.id === selected}>
            <Link className={s.rowName} href={receiptHref(scope, st)} prefetch={false}>
              {displayName(st.name)}
            </Link>
            <p className={s.rowMeta}>{storeMeta(st)}</p>
            <MerLink merUrl={st.merUrl ?? undefined} className={s.cta} />
          </li>
        ))}
      </ul>
      <div className={s.listFoot}>
        <p className={s.listShown} data-testid="list-shown" data-shown={visible.length} data-total={total}>
          전체 <span className={s.num}>{total}곳</span> 중 <span className={s.num}>{visible.length}곳</span> 표시
        </p>
        {rest > 0 ? (
          <button type="button" className={s.more} data-testid="list-more" onClick={showMore}>
            {Math.min(LIST_STEP, rest)}곳 더 보기
          </button>
        ) : null}
      </div>
    </>
  );
}

export function AnalysisView({ dataset, scope, fellBack }: { dataset: AreaDataset; scope: Scope; fellBack: boolean }) {
  const sp = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ChartTab>("peak");
  // 같은 화면의 결제 영수증(산점도에서 연다). 닫으면 연 요소로 포커스를 돌려준다.
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // 필터는 주소가 정본이다(공유, 뒤로 가기). 바꿀 때는 pushState로 주소만 고친다. 서버 왕복과 API 재호출이 없다.
  const filters = useMemo(() => {
    const raw: Record<string, string[]> = {};
    for (const k of new Set(sp.keys())) raw[k] = sp.getAll(k);
    return scopeFilters(scope, parseFilters(raw));
  }, [sp, scope]);
  const a = useMemo(() => analyze(dataset.stores, filters), [dataset.stores, filters]);
  const applied = a.filters;
  const path = analysisPath(scope, applied);

  // 들어온 주소에 버려진 값이 있으면 실제로 적용한 필터의 주소로 바꿔 둔다(기록은 늘리지 않는다).
  // 홍보 링크의 UTM은 뒤에 남기고, UTM 말고 다른 차이가 없으면 주소를 바꾸지 않는다(lib/utm).
  useEffect(() => {
    const url = tidyUrl(path, window.location);
    if (url) window.history.replaceState(null, "", url);
  }, [path]);

  const setFilters = (next: Filters) => {
    const href = analysisPath(scope, next);
    if (href !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", href);
  };
  const pick = (key: FilterKey) => (value: string) => setFilters(toggleFilter(applied, key, value));
  const flip = (flag: Flag) => () => setFilters(toggleFlag(applied, flag));
  const clearFlags = () => setFilters({ ...applied, local: false, hoesik: false });
  const clearAll = () => setFilters({ ...applied, cat: null, peak: null, cust: null, c1: null, local: false, hoesik: false });
  const shown = a.matched;
  const selected = selectedId && shown.some((st) => st.id === selectedId) ? selectedId : null;
  const onMap = shown.filter((st) => st.lat !== null && st.lng !== null).length;
  const offMap = shown.length - onMap;
  const bothFlags = applied.local && applied.hoesik;
  const onlyFlag: Flag = applied.local ? "local" : "hoesik";
  // 주소 기록을 남기지 않고 지도 제목으로 옮긴다(해시 이동은 라우터 밖 기록이 생겨 뒤로 가기와 필터가 어긋난다).
  // 768px 미만은 아래로 옮기므로 상단 바를 접어 묶고, 접힌 머리말 아래에 제목의 scroll-margin-top만큼 띄워 둔다.
  const toMap = () => {
    const h = document.getElementById("map-title");
    if (!h) return;
    const top = holdTop(true);
    if (top === null) h.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: window.scrollY + h.getBoundingClientRect().top - top - (Number.parseFloat(getComputedStyle(h).scrollMarginTop) || 0) });
    h.focus({ preventScroll: true });
  };
  const empty = dataset.stores.length === 0;
  const food = foodLabel(scope);
  // 가게 이름 조건을 풀면 같은 범위의 검색 전 화면(필터 없음, 프랜차이즈 제외 기본값)으로 간다.
  const storeOff = scope.store ? analysisPath({ ...scope, store: null }, null) : null;
  const receiptStore = receiptId ? (dataset.stores.find((st) => st.id === receiptId) ?? null) : null;
  const openReceipt = (st: Store, el: HTMLElement) => {
    opener.current = el;
    setReceiptId(st.id);
  };
  const closeReceipt = () => {
    const id = receiptId;
    setReceiptId(null);
    const t = opener.current;
    if (t && document.contains(t)) return t.focus();
    // 연 이름이 다시 그려졌으면 같은 매장 이름으로 돌려준다.
    const names = document.querySelectorAll<HTMLElement>('[data-testid="pyramid-store"]');
    [...names].find((el) => el.dataset.storeId === id)?.focus();
  };

  const chips: { key: FilterKey | Flag; text: string }[] = [];
  if (applied.cat) chips.push({ key: "cat", text: `업종 ${applied.cat}` });
  if (applied.peak) chips.push({ key: "peak", text: `피크 ${peakText(applied.peak)}` });
  if (applied.cust) chips.push({ key: "cust", text: `고객층 1~3위에 ${customerLabel(applied.cust)}` });
  if (applied.c1) chips.push({ key: "c1", text: `1위 고객층 ${c1Label(applied.c1)}` });
  if (applied.local) chips.push({ key: "local", text: FLAG_NAME.local });
  if (applied.hoesik) chips.push({ key: "hoesik", text: FLAG_NAME.hoesik });
  const pickC1 = (key: string) => {
    const c = applied.c1 ? cellOf(applied.c1) : null;
    const now = c ? cellKey(c.band, c.gender) : null;
    setFilters({ ...applied, c1: now === key ? null : key });
  };
  const peakHelp = useHelp("대표 피크", "셀 숫자는 그 요일과 시간대가 대표 피크인 매장 수입니다. 대표 피크는 결제 데이터로 본 매장별 가장 붐비는 요일과 시간대이며, 지금의 혼잡이나 대기 시간이 아닙니다.");
  const pyrHelp = useHelp("손님 피라미드", "칸의 수는 그 연령대와 성별이 1위 고객층인 매장 수입니다. 손님 수나 비율이 아닙니다.");
  const dropChip = (key: FilterKey | Flag) =>
    setFilters(key === "local" || key === "hoesik" ? { ...applied, [key]: false } : { ...applied, [key]: null });
  const matchCount = (where: "map" | "list") => (
    <p className={s.matchCount} data-testid="match-count" data-where={where} data-count={shown.length} aria-live="polite">
      조건에 맞는 매장 <span className={s.num}>{shown.length}곳</span>
      {where === "map" && offMap > 0 ? (
        <>
          , 좌표가 없는 <span className={s.num}>{offMap}곳</span>은 지도에서 빠집니다
        </>
      ) : null}
    </p>
  );

  return (
    <div className={s.stack}>
      <section className={s.panel} aria-labelledby="analysis-title">
        <h1 id="analysis-title" className={s.h1} data-testid="analysis-h1">
          {pageTitle(dataset.title, scope)}
        </h1>
        <p className={s.intro}>{PAGE_INTRO}</p>
        <dl className={s.facts}>
          <div className={s.fact}>
            <dt>조회 지역</dt>
            <dd data-testid="scope">{dataset.scopeLabel}</dd>
          </div>
          {scope.food ? (
            <div className={s.fact}>
              <dt>조회 업종</dt>
              <dd data-testid="scope-food">{food} 업종으로 조회</dd>
            </div>
          ) : null}
          {scope.store ? (
            <div className={s.fact}>
              <dt>가게 이름</dt>
              <dd data-testid="scope-store">{scope.store}, 프랜차이즈 포함</dd>
            </div>
          ) : null}
          <div className={s.fact}>
            <dt>분석 매장</dt>
            <dd data-testid="filtered">{a.filtered.length}곳</dd>
          </div>
        </dl>
        {scope.food ? (
          <p className={s.notice}>
            잇플 조회에 {food} 조건을 넣어 받은 매장입니다. 아래 업종별 매장 수와 매장 행의 업종은 매장별 원본 업종이며, 업종별 매장 수는 받은
            매장 안에서 다시 거르는 필터입니다.
            <Link className={s.inlineLink} href={analysisPath({ ...scope, food: null }, null)} prefetch={false}>
              업종 없이 다시 조회
            </Link>
          </p>
        ) : null}
        {fellBack ? <p className={s.notice}>알 수 없는 상권이라 강남역을 보여 줍니다.</p> : null}
        {dataset.failed > 0 ? (
          <p className={s.notice} data-testid="partial">
            일부 지역을 불러오지 못해 결과 일부만 보여 줍니다.
          </p>
        ) : null}
        {!empty ? (
          <>
            <div className={s.controls}>
              {scope.store ? null : (
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
              )}
              <button type="button" className={s.btn} onClick={clearAll} disabled={!hasSelection(applied)}>
                필터 모두 해제
              </button>
              <ShareButton path={path} />
              <button type="button" className={`${s.btn} ${s.mapJumpTop}`} data-testid="map-jump-top" onClick={toMap}>
                지도 보기
              </button>
            </div>
            {chips.length > 0 || storeOff ? (
              <div className={s.chips} aria-label="적용한 필터">
                {storeOff ? (
                  <Link className={s.chip} href={storeOff} prefetch={false} aria-label={`이름 ${scope.store} 필터 해제`} data-testid="store-chip">
                    이름 {scope.store} 해제
                  </Link>
                ) : null}
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={s.chip}
                    aria-label={`${c.text} 필터 해제`}
                    onClick={() => dropChip(c.key)}
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
        <section className={s.panel} data-testid="store-empty">
          <h2 className={s.h2}>조회된 매장이 없습니다</h2>
          {storeOff ? (
            <>
              <p className={s.empty}>
                {dataset.scopeLabel}에서 {scope.store} 이름이 들어간 가게를 찾지 못했습니다.
              </p>
              <div className={s.controls}>
                <Link className={s.btn} href={storeOff} prefetch={false}>
                  이름 조건 해제
                </Link>
              </div>
            </>
          ) : (
            <p className={s.empty}>
              {dataset.scopeLabel}에서 조회된 매장이 없습니다. 상단 검색창에서 다른 동네나 역을 찾아 주세요.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className={s.panel} aria-label="핵심 지표">
            <SummaryLine sum={a.summary} />
            <div className={s.kpiRow}>
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
              </dl>
              <div className={s.gauges} role="group" aria-labelledby="gauges-title">
                <p id="gauges-title" className={s.gaugesTitle}>
                  방문 성격
                </p>
                <FlagGauge flag="local" ratio={a.kpis.local} on={applied.local} onToggle={flip("local")} />
                <FlagGauge flag="hoesik" ratio={a.kpis.hoesik} on={applied.hoesik} onToggle={flip("hoesik")} />
              </div>
            </div>
            {hasFlag(applied) ? (
              <p className={s.kpiResult} role="status">
                <span>
                  조건에 맞는 매장 <span className={s.num}>{shown.length}곳</span>을 지도와 목록에 보여 줍니다.
                </span>
                <button type="button" className={s.jump} onClick={toMap}>
                  지도로 이동
                </button>
              </p>
            ) : null}
          </section>

          <div className={s.body}>
            <div className={s.charts}>
              <div className={s.tabs} role="tablist" aria-label="세부 차트">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`tab-${t.id}`}
                    className={s.tab}
                    data-testid="chart-tab"
                    data-tab={t.id}
                    aria-selected={tab === t.id}
                    aria-controls={`chart-${t.id}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <section id="chart-peak" className={`${s.panel} ${s.chartPanel}`} data-active={tab === "peak"} aria-labelledby="peak-title">
                <div className={s.titleRow}>
                  <h2 id="peak-title" className={s.h2}>
                    요일, 시간대별 대표 피크
                  </h2>
                  {peakHelp.button}
                  {peakHelp.panel}
                </div>
                <PeakTable grid={a.peak} selected={applied.peak} onPick={pick("peak")} />
              </section>

              <section id="chart-cust" className={`${s.panel} ${s.chartPanel}`} data-active={tab === "cust"} aria-labelledby="cust-title">
                <div className={s.titleRow}>
                  <h2 id="cust-title" className={s.h2}>
                    손님 피라미드
                  </h2>
                  {pyrHelp.button}
                  {pyrHelp.panel}
                </div>
                <PyramidChart data={a.pyramid} selected={applied.c1} onPick={pickC1} onOpen={openReceipt} />
              </section>

              <section id="chart-cat" className={`${s.panel} ${s.chartPanel}`} data-active={tab === "cat"} aria-labelledby="cat-title">
                <h2 id="cat-title" className={s.h2}>
                  업종별 매장 수
                </h2>
                <Treemap bars={a.categories} selected={applied.cat} onPick={pick("cat")} />
              </section>
            </div>

            <div className={s.side}>
              <section className={s.panel} aria-labelledby="map-title">
                <h2 id="map-title" className={`${s.h2} ${s.mapTitle}`} tabIndex={-1}>
                  지도
                </h2>
                {matchCount("map")}
                <div className={s.mapBox} data-testid="map" data-map-count={shown.length} data-on-map={onMap}>
                  <StoreMap stores={shown} selectedId={selected} onSelect={setSelectedId} me={null} height={320} touchAxis />
                </div>
              </section>

              <section className={s.panel} aria-labelledby="list-title">
                <h2 id="list-title" className={s.h2}>
                  매장 목록
                </h2>
                {matchCount("list")}
                <p className={s.caption}>시군구 매출 상위 순입니다. 매장 이름을 누르면 결제 영수증으로 갑니다.</p>
                {shown.length === 0 && a.filtered.length > 0 && hasFlag(applied) ? (
                  <div data-testid="kpi-empty">
                    <p className={s.empty}>
                      {bothFlags
                        ? "두 조건을 모두 만족하는 매장이 없습니다."
                        : a.kpis[onlyFlag].den === 0
                          ? `${FLAG_NAME[onlyFlag]} 값이 확인된 매장이 없습니다.`
                          : `지금 조건에서 ${FLAG_NAME[onlyFlag]} 매장이 없습니다.`}
                    </p>
                    <button type="button" className={s.more} onClick={clearFlags}>
                      조건 해제
                    </button>
                  </div>
                ) : shown.length === 0 ? (
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
                  <StoreList key={path} stores={shown} scope={scope} selected={selected} />
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {receiptStore ? <Receipt
          store={receiptStore}
          distance={null}
          distanceBasis={null}
          onClose={closeReceipt}
          analysisLoc={scope.kind === "loc" ? scope.loc : null}
          live
        /> : null}
    </div>
  );
}
