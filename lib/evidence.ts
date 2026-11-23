// 매장 근거(동네맛집 표시, 회식 적합 표시, 대표 피크, 매출 상위 %)와 근거 차트의 집계. 순수 함수, API 호출 없음.
// 비교 범위는 호출 쪽이 넘긴 stores 안에서만 정한다(프랜차이즈 제외는 호출 쪽이 미리 건다).
// BC카드가 표시를 붙인 기준은 응답에 없다. 여기서는 표시 여부와 조회 범위 안 위치만 센다.

import { type PeakGrid, computePeakGrid, peakKey } from "./analytics";
import { peakOf, percentLabel } from "./store-view";
import type { Store } from "./stores";

export type EvidenceKind = "local" | "hoesik" | "peak" | "rank";

/** 같은 업종 매장(이 매장 포함)이 이보다 적으면 비교 범위를 조회된 전체 매장으로 넓힌다 */
export const MIN_SAME_CATEGORY = 5;
/** 값이 확인된 매장이 이보다 적으면 차트를 그리지 않는다 */
export const MIN_KNOWN = 2;
/** pickEvidence에서 매출 상위 %를 앞쪽에 두는 기준(이하) */
export const TOP_RANK = 10;

/** 이 매장에 실제로 있는 근거만, 눈길을 끄는 순서로 */
export function pickEvidence(store: Store): EvidenceKind[] {
  const out: EvidenceKind[] = [];
  if (store.local === true) out.push("local");
  if (store.hoesik === true) out.push("hoesik");
  const hasRank = typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank);
  if (hasRank && (store.ccgRank as number) <= TOP_RANK) out.push("rank");
  if (store.peakDay && store.peakTime) out.push("peak");
  if (hasRank && !out.includes("rank")) out.push("rank");
  return out;
}

/** 근거 버튼과 대체 글자에 쓰는 짧은 라벨. 백분위는 원본 수치 그대로(올림, 반올림 없음). */
export function evidenceLabel(store: Store, kind: EvidenceKind): string {
  switch (kind) {
    case "local":
      return "동네맛집 표시";
    case "hoesik":
      return "회식 적합 표시";
    case "peak": {
      const p = peakOf(store);
      return p ? `대표 피크 ${p}` : "대표 피크 정보 없음";
    }
    case "rank":
      return store.ccgRank === null ? "매출 상위 정보 없음" : `${store.sigungu || "시군구"} 매출 상위 ${percentLabel(store.ccgRank)}`;
  }
}

export type CompareScope = {
  /** category: 같은 업종, all: 조회된 전체 매장(같은 업종이 너무 적어 넓힘) */
  kind: "category" | "all";
  category: string;
  /** 같은 업종 매장 수(이 매장 포함) */
  sameCategory: number;
  /** 비교에 쓰는 매장(이 매장 포함) */
  pool: Store[];
};

/** 비교 범위. stores에 이 매장이 없으면 넣어서 센다. */
export function compareScope(store: Store, stores: Store[]): CompareScope {
  const all = stores.some((s) => s.id === store.id) ? stores : [store, ...stores];
  const same = all.filter((s) => s.category === store.category);
  if (same.length >= MIN_SAME_CATEGORY) return { kind: "category", category: store.category, sameCategory: same.length, pool: same };
  return { kind: "all", category: store.category, sameCategory: same.length, pool: all };
}

export type FlagEvidence = {
  kind: "local" | "hoesik";
  scope: CompareScope;
  /** 값이 확인된(null 아닌) 매장 수 */
  known: number;
  yes: number;
  no: number;
  /** 값이 없는 매장 수(표시 없음에 합치지 않는다) */
  missing: number;
  /** 이 매장의 값 */
  mine: boolean | null;
  /** 값이 확인된 매장이 MIN_KNOWN 이상이면 true */
  chart: boolean;
};

export function flagEvidence(store: Store, stores: Store[], kind: "local" | "hoesik"): FlagEvidence {
  const scope = compareScope(store, stores);
  let yes = 0;
  let no = 0;
  let missing = 0;
  for (const s of scope.pool) {
    const v = s[kind];
    if (v === true) yes += 1;
    else if (v === false) no += 1;
    else missing += 1;
  }
  const known = yes + no;
  return { kind, scope, known, yes, no, missing, mine: store[kind], chart: known >= MIN_KNOWN };
}

export type PeakEvidence = {
  scope: CompareScope;
  /** 대표 피크(요일, 시간대 둘 다)가 확인된 매장 수 */
  known: number;
  missing: number;
  grid: PeakGrid;
  /** 이 매장의 셀 key("금-저녁"). 없으면 null */
  mine: string | null;
  chart: boolean;
};

export function peakEvidence(store: Store, stores: Store[]): PeakEvidence {
  const scope = compareScope(store, stores);
  const mine = peakKey(store);
  const grid = computePeakGrid(scope.pool, scope.pool, mine);
  const known = scope.pool.length - grid.missing;
  return { scope, known, missing: grid.missing, grid, mine, chart: known >= MIN_KNOWN && mine !== null };
}

export type RankEvidence = {
  /** 시군구 매출 상위 %(원본). 없으면 null */
  ccg: number | null;
  /** 전국 매출 상위 %(원본). 없으면 null */
  all: number | null;
  sigungu: string;
  /** 축 위치 0~100(범위 밖 값은 끝에 붙인다) */
  position: number | null;
  chart: boolean;
};

export function rankEvidence(store: Store): RankEvidence {
  const ccg = typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank) ? store.ccgRank : null;
  const all = typeof store.allRank === "number" && Number.isFinite(store.allRank) ? store.allRank : null;
  return { ccg, all, sigungu: store.sigungu, position: ccg === null ? null : Math.min(100, Math.max(0, ccg)), chart: ccg !== null };
}

/**
 * 고른 시간과 이 매장의 대표 피크. 고른 값이 없으면 null.
 * 겹칠 때만 "같습니다"라고 쓰고, 안 겹치면 대표 피크만 알린다(한산하다고 쓰지 않는다).
 */
export function timeLine(store: Store, time?: { day?: string; time?: string }): string | null {
  if (!time || (!time.day && !time.time)) return null;
  const p = peakOf(store);
  if (!store.peakDay || !store.peakTime || !p) return "이 매장의 대표 피크 정보가 없습니다.";
  const dayOk = !time.day || time.day === store.peakDay;
  const timeOk = !time.time || time.time === store.peakTime;
  return dayOk && timeOk ? "고른 시간이 이 매장의 대표 피크와 같습니다." : `이 매장의 대표 피크는 ${p}입니다.`;
}

/** 비교 범위 문장 앞부분. 넓혔으면 그 사실을 한 문장으로 먼저 쓴다. */
export function scopePhrase(scope: CompareScope): string {
  return scope.kind === "category"
    ? `같은 업종(${scope.category}), `
    : `같은 업종(${scope.category}) 매장이 ${scope.sameCategory}곳뿐이라 조회된 전체 매장으로 넓혔습니다. `;
}

/** 표시 차트 아래 문장: "같은 업종(고기구이), 표시가 확인된 24곳 중 6곳" */
export function flagSentence(e: FlagEvidence): string {
  return `${scopePhrase(e.scope)}표시가 확인된 ${e.known}곳 중 ${e.yes}곳`;
}

/** 피크 표 아래 문장 */
export function peakSentence(e: PeakEvidence): string {
  return `${scopePhrase(e.scope)}대표 피크가 확인된 ${e.known}곳 기준`;
}

/** 누락 문장. 누락이 없으면 null */
export function missingSentence(missing: number): string | null {
  return missing > 0 ? `값이 없는 매장 ${missing}곳은 뺐습니다.` : null;
}
