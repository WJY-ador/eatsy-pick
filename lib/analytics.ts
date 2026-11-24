// 상권 분석(/analysis)과 그 OG 카드가 같이 쓰는 순수 계산.
// 입력은 loadArea가 준 Store[]와 필터, 출력은 집계다. 화면 컴포넌트에 계산을 흩지 않는다.
// 이 파일은 type-only import만 쓴다. Node 단언 스크립트가 .ts 그대로 돌릴 수 있게 하려는 것이다.

import type { Store } from "./stores";

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
/** API 시간대의 표시 순서. 데이터에 나온 것만 행으로 쓴다. */
export const TIMES = ["새벽", "오전", "점심", "오후", "저녁", "심야"] as const;

export type Filters = {
  /** 업종(merTpbuzNm 원문) */
  cat: string | null;
  /** 대표 피크 "요일-시간대"(예 "금-저녁") */
  peak: string | null;
  /** 고객층 원문(예 "30대남성") */
  cust: string | null;
  /** 프랜차이즈 제외. 기본 true, URL fr=0이면 false */
  fr: boolean;
  /** 동네맛집(loclPrsnPpltYn === true)만. URL local=1 */
  local: boolean;
  /** 회식 적합(empyVsitYn === true)만. URL hoesik=1 */
  hoesik: boolean;
};
export type FilterKey = "cat" | "peak" | "cust";
/** KPI를 눌러 거는 조건. 이름이 Store의 필드 이름과 같다 */
export type Flag = "local" | "hoesik";
export const FLAGS: readonly Flag[] = ["local", "hoesik"];
export const EMPTY_FILTERS: Filters = { cat: null, peak: null, cust: null, fr: true, local: false, hoesik: false };

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | undefined, max: number): string | null {
  const t = v?.trim();
  return t && t.length <= max ? t : null;
}

const PEAK_RE = new RegExp(`^(${DAYS.join("|")})-(${TIMES.join("|")})$`);

/** URL 쿼리에서 필터를 읽는다. 꼴이 틀린 값은 버린다(페이지와 OG는 200을 유지). */
export function parseFilters(raw: RawParams): Filters {
  const peak = clean(first(raw.peak), 8);
  const cust = clean(first(raw.cust), 20);
  return {
    cat: clean(first(raw.cat), 40),
    peak: peak && PEAK_RE.test(peak) ? peak : null,
    cust: cust && /^[0-9가-힣 ]+$/.test(cust) ? cust : null,
    fr: first(raw.fr) !== "0",
    local: first(raw.local) === "1",
    hoesik: first(raw.hoesik) === "1",
  };
}

/** 필터를 쿼리 쌍으로. 순서는 cat, peak, cust, local, hoesik, fr. 기본값(fr 켬, 선택 없음)은 넣지 않는다. */
export function filterEntries(f: Filters): [string, string][] {
  const out: [string, string][] = [];
  if (f.cat) out.push(["cat", f.cat]);
  if (f.peak) out.push(["peak", f.peak]);
  if (f.cust) out.push(["cust", f.cust]);
  if (f.local) out.push(["local", "1"]);
  if (f.hoesik) out.push(["hoesik", "1"]);
  if (!f.fr) out.push(["fr", "0"]);
  return out;
}

export function peakKey(s: Pick<Store, "peakDay" | "peakTime">): string | null {
  return s.peakDay && s.peakTime ? `${s.peakDay}-${s.peakTime}` : null;
}

export function splitPeak(key: string): { day: string; time: string } {
  const [day, time] = key.split("-");
  return { day, time };
}

/**
 * 데이터 어디에도 없는 선택값은 버린다. 공유 URL이 고친 응답과 맞지 않을 때 0곳으로 굳지 않게 하려는 것이다.
 * KPI 조건(local, hoesik)은 버리지 않는다. 두 조건의 교집합이 0곳인 공유 주소도 같은 빈 상태를 다시 보여야 한다.
 */
export function sanitizeFilters(stores: Store[], f: Filters): Filters {
  return {
    fr: f.fr,
    local: f.local,
    hoesik: f.hoesik,
    cat: f.cat && stores.some((s) => s.category === f.cat) ? f.cat : null,
    peak: f.peak && stores.some((s) => peakKey(s) === f.peak) ? f.peak : null,
    cust: f.cust && stores.some((s) => s.customers.includes(f.cust as string)) ? f.cust : null,
  };
}

/** 같은 항목을 다시 고르면 해제, 다른 항목이면 바꾼다. */
export function toggleFilter(f: Filters, key: FilterKey, value: string): Filters {
  return { ...f, [key]: f[key] === value ? null : value };
}

/** KPI 조건을 켜고 끈다 */
export function toggleFlag(f: Filters, flag: Flag): Filters {
  return { ...f, [flag]: !f[flag] };
}

export function hasFlag(f: Filters): boolean {
  return f.local || f.hoesik;
}

export function hasSelection(f: Filters): boolean {
  return Boolean(f.cat || f.peak || f.cust || hasFlag(f));
}

/** 프랜차이즈 제외만 적용한 집합 */
export function baseStores(stores: Store[], fr: boolean): Store[] {
  return fr ? stores.filter((s) => !s.franchise) : stores;
}

function matches(s: Store, f: Filters, except?: FilterKey): boolean {
  if (except !== "cat" && f.cat && s.category !== f.cat) return false;
  if (except !== "peak" && f.peak && peakKey(s) !== f.peak) return false;
  if (except !== "cust" && f.cust && !s.customers.includes(f.cust)) return false;
  return true;
}

/** 프랜차이즈 제외 + 차트 필터 교집합. except를 주면 그 차트의 필터만 뺀다. KPI 조건은 여기서 걸지 않는다(matchFlags). */
export function applyFilters(stores: Store[], f: Filters, except?: FilterKey): Store[] {
  return baseStores(stores, f.fr).filter((s) => matches(s, f, except));
}

/** 켠 KPI 조건을 모두 충족하는 매장. 값이 true인 매장만 남긴다(false와 누락은 뺀다) */
export function matchFlags(stores: Store[], f: Filters): Store[] {
  return stores.filter((s) => FLAGS.every((k) => !f[k] || s[k] === true));
}

export type Ratio = { num: number; den: number };

/** true인 매장 수 ÷ 값이 확인된(null 아닌) 매장 수 */
export function ratioOf(stores: Store[], pick: (s: Store) => boolean | null): Ratio {
  let num = 0;
  let den = 0;
  for (const s of stores) {
    const v = pick(s);
    if (v === null) continue;
    den += 1;
    if (v) num += 1;
  }
  return { num, den };
}

/** 비중 표기. 분모 0이면 null(화면은 "정보 없음"). 계산한 비중은 정수 %로 반올림한다(원본 백분위가 아니다). */
export function ratioPercent(r: Ratio): number | null {
  return r.den === 0 ? null : Math.round((r.num / r.den) * 100);
}

export type TopCustomer = { leaders: string[]; num: number; den: number };

export type Kpis = {
  count: number;
  local: Ratio;
  hoesik: Ratio;
  /** 원본 rk01(customer1) 기준. rk01이 없는 매장은 미확인으로 빼고 rk02를 올리지 않는다. 유효 표본이 없으면 null */
  topCustomer: TopCustomer | null;
};

export function computeKpis(stores: Store[]): Kpis {
  const counts = new Map<string, number>();
  let den = 0;
  for (const s of stores) {
    // 옛 기기 스냅샷에는 customer1이 없을 수 있다(undefined도 미확인).
    const c = typeof s.customer1 === "string" && s.customer1 !== "" ? s.customer1 : null;
    if (!c) continue;
    den += 1;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let top: TopCustomer | null = null;
  if (den > 0) {
    const max = Math.max(...counts.values());
    top = { leaders: [...counts].filter(([, n]) => n === max).map(([k]) => k), num: max, den };
  }
  return {
    count: stores.length,
    local: ratioOf(stores, (s) => s.local),
    hoesik: ratioOf(stores, (s) => s.hoesik),
    topCustomer: top,
  };
}

export type PeakGrid = {
  /** 행(시간대). 데이터에 나온 것만, TIMES 순서. 모르는 시간대는 뒤에 붙인다. */
  times: string[];
  /** key "요일-시간대" → 매장 수 */
  cells: Record<string, number>;
  max: number;
  /** 대표 피크가 없거나 요일을 모르는 매장 수(표에서 빠짐) */
  missing: number;
};

/**
 * 요일 × 시간대 표. counted는 셀 수를 셀 집합(피크 필터만 뺀 것), rowsFrom은 행을 정할 집합(프랜차이즈 제외만 한 것).
 * 행을 rowsFrom으로 고정해 다른 필터가 바뀌어도 표 모양이 흔들리지 않게 한다.
 */
export function computePeakGrid(counted: Store[], rowsFrom: Store[], selected: string | null = null): PeakGrid {
  const seen = new Set<string>();
  for (const s of rowsFrom) if (s.peakTime && s.peakDay && (DAYS as readonly string[]).includes(s.peakDay)) seen.add(s.peakTime);
  if (selected) seen.add(splitPeak(selected).time);
  const known = TIMES.filter((t) => seen.has(t));
  const extra = [...seen].filter((t) => !(TIMES as readonly string[]).includes(t));
  const cells: Record<string, number> = {};
  let missing = 0;
  for (const s of counted) {
    const k = peakKey(s);
    if (!k || !(DAYS as readonly string[]).includes(s.peakDay as string)) {
      missing += 1;
      continue;
    }
    cells[k] = (cells[k] ?? 0) + 1;
  }
  const max = Object.values(cells).reduce((a, b) => Math.max(a, b), 0);
  return { times: [...known, ...extra], cells, max, missing };
}

/** 히트맵 단계 0~5. 0은 빈 셀, 1~5는 --color-data-1~5 */
export function heatStep(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((count / max) * 5)));
}

export type Bar = { key: string; count: number };

function sortBars(m: Map<string, number>, selected: string | null): Bar[] {
  if (selected && !m.has(selected)) m.set(selected, 0);
  return [...m]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ko"));
}

export type CustomerBars = { bars: Bar[]; sample: number };

/** 고객층 1~3위에 그 고객층이 나온 매장 수. sample은 customers가 1개 이상인 매장 수 */
export function computeCustomerBars(stores: Store[], selected: string | null = null): CustomerBars {
  const m = new Map<string, number>();
  let sample = 0;
  for (const s of stores) {
    if (s.customers.length === 0) continue;
    sample += 1;
    for (const c of new Set(s.customers)) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return { bars: sortBars(m, selected), sample };
}

/** 업종별 매장 수 내림차순(같으면 가나다순) */
export function computeCategoryBars(stores: Store[], selected: string | null = null): Bar[] {
  const m = new Map<string, number>();
  for (const s of stores) m.set(s.category, (m.get(s.category) ?? 0) + 1);
  return sortBars(m, selected);
}

export type Analysis = {
  filters: Filters;
  /** 프랜차이즈 제외만 적용 */
  base: Store[];
  /** 기준 집합: 프랜차이즈와 차트 필터 적용(KPI, 차트, 분석 매장 수). KPI 조건을 켜고 꺼도 바뀌지 않는다 */
  filtered: Store[];
  /** 결과 집합: 기준 집합에 KPI 조건까지 적용(지도, 목록) */
  matched: Store[];
  kpis: Kpis;
  /** 각 차트는 자기 필터를 뺀 나머지 필터로 계산한다 */
  peak: PeakGrid;
  customers: CustomerBars;
  categories: Bar[];
  /** 응답 전체에서 프랜차이즈로 판정된 매장 수 */
  franchiseCount: number;
};

export function analyze(stores: Store[], filters: Filters): Analysis {
  const f = sanitizeFilters(stores, filters);
  const base = baseStores(stores, f.fr);
  const filtered = applyFilters(stores, f);
  return {
    filters: f,
    base,
    filtered,
    matched: matchFlags(filtered, f),
    kpis: computeKpis(filtered),
    peak: computePeakGrid(applyFilters(stores, f, "peak"), base, f.peak),
    customers: computeCustomerBars(applyFilters(stores, f, "cust"), f.cust),
    categories: computeCategoryBars(applyFilters(stores, f, "cat"), f.cat),
    franchiseCount: stores.filter((s) => s.franchise).length,
  };
}

/** 원본 백분위 그대로: 0.04 → "0.04%", 100 → "100%", null → "정보 없음". 올림, 반올림 없음. */
export function formatRank(v: number | null): string {
  return v === null ? "정보 없음" : `${String(v)}%`;
}
