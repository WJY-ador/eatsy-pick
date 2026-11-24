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
  /** 고객층 원문(예 "30대남성"). 1~3위 중 하나라도 그 고객층인 매장. 거는 화면은 없고 옛 공유 주소만 읽는다(칩으로 해제) */
  cust: string | null;
  /**
   * 1위 고객층. URL c1. 손님 피라미드 칸 키(예 "20대이하여성", "30대남성")이고 rk01이 그 칸에 드는 매장.
   * 옛 주소의 원문 값("20대여성", "10대남성")은 읽을 때 칸 키로 바꾼다(20대 이하는 10대와 20대를 묶는다).
   */
  c1: string | null;
  /** 프랜차이즈 제외. 기본 true, URL fr=0이면 false */
  fr: boolean;
  /** 동네맛집(loclPrsnPpltYn === true)만. URL local=1 */
  local: boolean;
  /** 회식 적합(empyVsitYn === true)만. URL hoesik=1 */
  hoesik: boolean;
};
export type FilterKey = "cat" | "peak" | "cust" | "c1";
/** KPI를 눌러 거는 조건. 이름이 Store의 필드 이름과 같다 */
export type Flag = "local" | "hoesik";
export const FLAGS: readonly Flag[] = ["local", "hoesik"];
export const EMPTY_FILTERS: Filters = { cat: null, peak: null, cust: null, c1: null, fr: true, local: false, hoesik: false };

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
  const c1 = clean(first(raw.c1), 20);
  return {
    cat: clean(first(raw.cat), 40),
    peak: peak && PEAK_RE.test(peak) ? peak : null,
    cust: cust && /^[0-9가-힣 ]+$/.test(cust) ? cust : null,
    c1: c1 && /^[0-9가-힣 ]+$/.test(c1) ? toCellKey(c1) : null,
    fr: first(raw.fr) !== "0",
    local: first(raw.local) === "1",
    hoesik: first(raw.hoesik) === "1",
  };
}

/**
 * 필터를 쿼리 쌍으로. 순서는 cat, peak, cust, local, hoesik, fr, c1. 기본값(fr 켬, 선택 없음)은 넣지 않는다.
 * c1은 나중에 생긴 키라 맨 뒤에 둔다(c1이 없는 기존 공유 주소는 글자 그대로 같다).
 */
export function filterEntries(f: Filters): [string, string][] {
  const out: [string, string][] = [];
  if (f.cat) out.push(["cat", f.cat]);
  if (f.peak) out.push(["peak", f.peak]);
  if (f.cust) out.push(["cust", f.cust]);
  if (f.local) out.push(["local", "1"]);
  if (f.hoesik) out.push(["hoesik", "1"]);
  if (!f.fr) out.push(["fr", "0"]);
  if (f.c1) out.push(["c1", f.c1]);
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
    c1: f.c1 && stores.some((s) => c1Matches(s, f.c1 as string)) ? f.c1 : null,
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
  return Boolean(f.cat || f.peak || f.cust || f.c1 || hasFlag(f));
}

/** 프랜차이즈 제외만 적용한 집합 */
export function baseStores(stores: Store[], fr: boolean): Store[] {
  return fr ? stores.filter((s) => !s.franchise) : stores;
}

function matches(s: Store, f: Filters, except: readonly FilterKey[]): boolean {
  if (!except.includes("cat") && f.cat && s.category !== f.cat) return false;
  if (!except.includes("peak") && f.peak && peakKey(s) !== f.peak) return false;
  if (!except.includes("cust") && f.cust && !s.customers.includes(f.cust)) return false;
  if (!except.includes("c1") && f.c1 && !c1Matches(s, f.c1)) return false;
  return true;
}

/** 프랜차이즈 제외 + 차트 필터 교집합. except를 주면 그 차트의 필터만 뺀다. KPI 조건은 여기서 걸지 않는다(matchFlags). */
export function applyFilters(stores: Store[], f: Filters, except?: FilterKey | readonly FilterKey[]): Store[] {
  const ex: readonly FilterKey[] = except === undefined ? [] : typeof except === "string" ? [except] : except;
  return baseStores(stores, f.fr).filter((s) => matches(s, f, ex));
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

/** 원본 rk01. 옛 기기 스냅샷에는 customer1이 없을 수 있다(undefined와 빈 값은 미확인). rk02를 올리지 않는다 */
export function customer1Of(s: Store): string | null {
  return typeof s.customer1 === "string" && s.customer1 !== "" ? s.customer1 : null;
}

/** 대표 피크 한 쌍이 확인된 매장의 키. 요일이 월~일 밖이면 미확인 */
export function validPeakKey(s: Store): string | null {
  const k = peakKey(s);
  return k && (DAYS as readonly string[]).includes(s.peakDay as string) ? k : null;
}

/**
 * 가장 많이 나온 값(최빈값). null은 미확인으로 분모에서 뺀다. 동률이면 모두 leaders에 넣는다(처음 나온 순서).
 * 확인된 값이 하나도 없으면 null.
 */
export function leadersOf(values: (string | null)[]): TopCustomer | null {
  const counts = new Map<string, number>();
  let den = 0;
  for (const v of values) {
    if (!v) continue;
    den += 1;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (den === 0) return null;
  const max = Math.max(...counts.values());
  return { leaders: [...counts].filter(([, n]) => n === max).map(([k]) => k), num: max, den };
}

/** 요약 줄. 현재 조건에 맞는 매장(지도, 목록과 같은 집합)에서 센다 */
export type Summary = {
  total: number;
  /** 대표 피크 "요일-시간대" 최빈값. num은 그 조합이 대표 피크인 매장 수, den은 대표 피크가 확인된 매장 수 */
  peak: TopCustomer | null;
  /** 원본 rk01 최빈값. num은 그 고객층이 1위인 매장 수, den은 rk01이 확인된 매장 수 */
  customer: TopCustomer | null;
};

export function summarize(stores: Store[]): Summary {
  return { total: stores.length, peak: leadersOf(stores.map(validPeakKey)), customer: leadersOf(stores.map(customer1Of)) };
}

export type Kpis = {
  count: number;
  local: Ratio;
  hoesik: Ratio;
  /** 원본 rk01(customer1) 기준. rk01이 없는 매장은 미확인으로 빼고 rk02를 올리지 않는다. 유효 표본이 없으면 null */
  topCustomer: TopCustomer | null;
};

export function computeKpis(stores: Store[]): Kpis {
  return {
    count: stores.length,
    local: ratioOf(stores, (s) => s.local),
    hoesik: ratioOf(stores, (s) => s.hoesik),
    topCustomer: leadersOf(stores.map(customer1Of)),
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

/** 업종별 매장 수 내림차순(같으면 가나다순) */
export function computeCategoryBars(stores: Store[], selected: string | null = null): Bar[] {
  const m = new Map<string, number>();
  for (const s of stores) m.set(s.category, (m.get(s.category) ?? 0) + 1);
  return sortBars(m, selected);
}

/** 손님 피라미드 세로 축. 위에서 아래로 그리는 순서는 화면이 정한다. 10대는 20대 이하에 넣는다 */
export const AGE_BANDS = [
  { key: "20대이하", label: "20대 이하" },
  { key: "30대", label: "30대" },
  { key: "40대", label: "40대" },
  { key: "50대", label: "50대" },
  { key: "60대이상", label: "60대 이상" },
] as const;
export const GENDERS = ["남성", "여성"] as const;
export type Gender = (typeof GENDERS)[number];
/** 피라미드 칸 하나. key는 c1 주소 값(예 "20대이하여성") */
export type PyramidCell = { key: string; band: number; gender: Gender; count: number; top: Store[] };
export type Pyramid = {
  /** AGE_BANDS 순서. 칸마다 [남성, 여성] */
  rows: [PyramidCell, PyramidCell][];
  /** rk01이 확인된 매장 수 */
  den: number;
  /** rk01은 있지만 연령대, 성별을 읽지 못한 매장 수(칸에서 빠짐) */
  unread: number;
  max: number;
};

const C1_RE = /^(\d+)대(이상|이하)?(남성|여성)$/;

/** rk01 원문이나 칸 키를 칸(연령대 순번, 성별)으로. 읽지 못하면 null */
export function cellOf(raw: string): { band: number; gender: Gender } | null {
  const m = C1_RE.exec(raw.replace(/\s+/g, ""));
  if (!m) return null;
  const age = Number(m[1]);
  const band = age <= 20 ? 0 : age >= 60 ? 4 : age === 30 ? 1 : age === 40 ? 2 : age === 50 ? 3 : -1;
  return band < 0 ? null : { band, gender: m[3] as Gender };
}

export function cellKey(band: number, gender: Gender): string {
  return `${AGE_BANDS[band].key}${gender}`;
}

function isCellKey(v: string): boolean {
  const c = cellOf(v);
  return c !== null && cellKey(c.band, c.gender) === v;
}

/** 연령대와 성별을 읽을 수 있는 값은 칸 키로, 못 읽는 값은 그대로 둔다 */
export function toCellKey(v: string): string {
  const c = cellOf(v);
  return c ? cellKey(c.band, c.gender) : v;
}

/** c1 조건. 칸 키면 칸으로 비교해 피라미드 칸 수와 같은 매장을 고른다. 칸으로 못 읽는 값만 원문 그대로 비교한다 */
export function c1Matches(s: Store, c1: string): boolean {
  const v = customer1Of(s);
  if (!v) return false;
  if (!isCellKey(c1)) return v === c1;
  const c = cellOf(v);
  return c !== null && cellKey(c.band, c.gender) === c1;
}

/** c1 값의 화면 글. "20대이하여성" → "20대 이하 여성", "60대이상남성" → "60대 이상 남성" */
export function c1Label(v: string): string {
  return v
    .replace(/(이상|이하)/, " $1")
    .replace(/(남성|여성)$/, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 매출 상위 순(ccgRank 오름차순, 값 없으면 뒤). 같으면 받은 순서 */
function byRank(a: Store, b: Store): number {
  const x = a.ccgRank ?? Number.POSITIVE_INFINITY;
  const y = b.ccgRank ?? Number.POSITIVE_INFINITY;
  return x === y ? 0 : x < y ? -1 : 1;
}

/** 1위 고객층(rk01)을 연령대 5단 × 성별 칸으로 센다. 칸마다 매출 상위 3곳을 같이 준다 */
export function computePyramid(stores: Store[], topN = 3): Pyramid {
  const groups = AGE_BANDS.map(() => [[] as Store[], [] as Store[]]);
  let den = 0;
  let unread = 0;
  for (const s of stores) {
    const v = customer1Of(s);
    if (!v) continue;
    den += 1;
    const c = cellOf(v);
    if (!c) {
      unread += 1;
      continue;
    }
    groups[c.band][GENDERS.indexOf(c.gender)].push(s);
  }
  let max = 0;
  const rows = groups.map((pair, band) => {
    const cells = pair.map((list, gi) => {
      max = Math.max(max, list.length);
      return { key: cellKey(band, GENDERS[gi]), band, gender: GENDERS[gi], count: list.length, top: [...list].sort(byRank).slice(0, topN) };
    });
    return [cells[0], cells[1]] as [PyramidCell, PyramidCell];
  });
  return { rows, den, unread, max };
}

/** 트리맵 블록 자리(단위 %). 그림 상자 왼쪽 위가 0 */
export type TreeRect = { key: string; count: number; x: number; y: number; w: number; h: number };

/**
 * 면적이 값에 비례하는 블록 배치(squarified). items는 값 내림차순, 0은 넣지 않는다.
 * ratio는 그림 상자의 가로 ÷ 세로. 반환 자리는 상자 기준 %다.
 */
export function squarify(items: { key: string; count: number }[], ratio: number): TreeRect[] {
  const total = items.reduce((a, b) => a + b.count, 0);
  if (total <= 0) return [];
  const W = ratio;
  const H = 1;
  const scale = (W * H) / total;
  const out: TreeRect[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0);
    const mx = Math.max(...row);
    const mn = Math.min(...row);
    return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
  };
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const row: number[] = [items[i].count * scale];
    let j = i + 1;
    while (j < items.length) {
      const next = [...row, items[j].count * scale];
      if (worst(next, side) > worst(row, side)) break;
      row.push(items[j].count * scale);
      j += 1;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    const last = j >= items.length;
    if (w >= h) {
      // 왼쪽에 세로 줄을 채운다
      const cw = last ? w : sum / h;
      let cy = y;
      row.forEach((a, k) => {
        const ch = k === row.length - 1 ? y + h - cy : a / cw;
        out.push({ key: items[i + k].key, count: items[i + k].count, x, y: cy, w: cw, h: ch });
        cy += ch;
      });
      x += cw;
      w -= cw;
    } else {
      // 위에 가로 줄을 채운다
      const ch = last ? h : sum / w;
      let cx = x;
      row.forEach((a, k) => {
        const cw = k === row.length - 1 ? x + w - cx : a / ch;
        out.push({ key: items[i + k].key, count: items[i + k].count, x: cx, y, w: cw, h: ch });
        cx += cw;
      });
      y += ch;
      h -= ch;
    }
    i = j;
  }
  return out.map((r) => ({ ...r, x: (r.x / W) * 100, y: (r.y / H) * 100, w: (r.w / W) * 100, h: (r.h / H) * 100 }));
}

export type TreemapPlan = {
  /** 블록으로 그릴 업종(매장 수 내림차순, 0곳 제외) */
  blocks: Bar[];
  /** "그 밖" 블록으로 묶은 업종. 2개 이상일 때만 묶는다 */
  rest: Bar[];
};

/**
 * 트리맵에 블록으로 둘 업종과 묶을 업종을 나눈다. 앞에서부터 최대 maxBlocks개, 비중 minShare 이상만 블록으로 둔다.
 * 고른 업종은 묶음에 들어가도 블록으로 끌어올린다. 묶음이 한 업종뿐이면 묶지 않는다. 0곳 업종은 그리지 않는다(해제는 칩으로).
 */
export function planTreemap(bars: Bar[], selected: string | null, maxBlocks = 8, minShare = 0.03): TreemapPlan {
  const live = bars.filter((b) => b.count > 0);
  const total = live.reduce((a, b) => a + b.count, 0);
  const blocks: Bar[] = [];
  const rest: Bar[] = [];
  for (const b of live) {
    if (blocks.length === 0 || (blocks.length < maxBlocks && b.count / total >= minShare)) blocks.push(b);
    else rest.push(b);
  }
  const sel = rest.findIndex((b) => b.key === selected);
  if (sel >= 0) blocks.push(...rest.splice(sel, 1));
  if (rest.length === 1) blocks.push(...rest.splice(0, 1));
  blocks.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ko"));
  return { blocks, rest };
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
  /** 손님 피라미드. 1위 고객층 필터(c1)만 뺀 나머지 필터와 KPI 조건(동네맛집, 회식 적합)으로 센다 */
  pyramid: Pyramid;
  categories: Bar[];
  /** 요약 줄(현재 조건 = matched 기준) */
  summary: Summary;
  /** 응답 전체에서 프랜차이즈로 판정된 매장 수 */
  franchiseCount: number;
};

export function analyze(stores: Store[], filters: Filters): Analysis {
  const f = sanitizeFilters(stores, filters);
  const base = baseStores(stores, f.fr);
  const filtered = applyFilters(stores, f);
  const matched = matchFlags(filtered, f);
  return {
    filters: f,
    base,
    filtered,
    matched,
    kpis: computeKpis(filtered),
    peak: computePeakGrid(applyFilters(stores, f, "peak"), base, f.peak),
    pyramid: computePyramid(matchFlags(applyFilters(stores, f, "c1"), f)),
    categories: computeCategoryBars(applyFilters(stores, f, "cat"), f.cat),
    summary: summarize(matched),
    franchiseCount: stores.filter((s) => s.franchise).length,
  };
}

/** 원본 백분위 그대로: 0.04 → "0.04%", 100 → "100%", null → "정보 없음". 올림, 반올림 없음. */
export function formatRank(v: number | null): string {
  return v === null ? "정보 없음" : `${String(v)}%`;
}
