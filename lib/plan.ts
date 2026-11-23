// 다음 약속 후보를 고르는 순수 함수. 브라우저, React, Next 없이 node에서 바로 돈다.
// 그래서 런타임 import를 두지 않는다(타입 import만).

import type { Store } from "./stores";
import type { VisitRecord } from "./visits";

/** 모임 유형. 고르지 않아도 된다. */
export const OCCASIONS = ["점심", "회식", "친구 약속", "접대", "한잔"] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** 대표 피크 요일과 시간대. API의 congestionDwk, congestionTizn 값과 같은 글자다. */
export const PEAK_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export const PEAK_TIMES = ["오전", "점심", "오후", "저녁", "심야", "새벽"] as const;

export function isOccasion(v: unknown): v is Occasion {
  return typeof v === "string" && (OCCASIONS as readonly string[]).includes(v);
}

/** 회식 적합 표시(hoesik)를 먼저 보는 모임 유형 */
const HOESIK_FIRST: readonly Occasion[] = ["회식", "접대"];

/** 새 후보 최대 수, 다시 갈 곳 최대 수 */
export const FRESH_LIMIT = 3;
export const REVISIT_LIMIT = 3;

export const PEAK_MATCH_TEXT = "고른 시간이 이 매장의 대표 피크와 같습니다";

export type PlanInput = {
  records: VisitRecord[];
  stores: Store[];
  occasion?: Occasion | null;
  day?: string | null;
  time?: string | null;
  here?: { lat: number; lng: number } | null;
};

export type PlanRevisit = { record: VisitRecord; reason: string; peakMatch: boolean };
export type PlanFresh = { store: Store; reason: string; peakMatch: boolean };
export type Plan = { revisit: PlanRevisit[]; fresh: PlanFresh[] };

/**
 * 시간 조건과 매장 대표 피크가 같은지 본다.
 * 요일과 시간대를 둘 다 골랐으면 둘 다 같아야 한다. 하나만 골랐으면 그 하나만 본다.
 * 아무것도 안 골랐거나 매장 피크 값이 없으면 false다. false일 때 화면은 아무 말도 붙이지 않는다.
 */
export function peakMatches(
  store: Pick<Store, "peakDay" | "peakTime">,
  day?: string | null,
  time?: string | null,
): boolean {
  if (!day && !time) return false;
  if (day && store.peakDay !== day) return false;
  if (time && store.peakTime !== time) return false;
  return true;
}

/** 받침이 없거나 ㄹ받침이면 "로", 그 밖은 "으로" */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}로`;
  const jong = (code - 0xac00) % 28;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

/** 원본 백분위를 그대로 적는다. 올림, 반올림, toFixed를 쓰지 않는다. null은 "정보 없음" */
export function pctLabel(v: number | null): string {
  return v === null ? "정보 없음" : `${String(v)}%`;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceText(m: number): string {
  if (m >= 1000) return `약 ${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `약 ${Math.max(10, Math.round(m / 10) * 10)}m`;
}

function latestAt(r: VisitRecord): string {
  return r.visits.reduce((max, v) => (v.at > max ? v.at : max), "");
}

/**
 * 다시 갈 곳의 이유. 실제로 기록된 방문의 모임 유형만 쓴다(지금 고른 유형을 끼워 넣지 않는다).
 * 고른 유형과 같은 방문이 있으면 그 유형, 없으면 가장 최근 방문에 남긴 유형, 그것도 없으면 유형 없이 쓴다.
 */
function revisitReason(r: VisitRecord, occasion: Occasion | null): string {
  let occ: Occasion | undefined;
  if (occasion && r.visits.some((v) => v.occasion === occasion)) occ = occasion;
  if (!occ) {
    const sorted = [...r.visits].sort((a, b) => (a.at < b.at ? 1 : -1));
    occ = sorted.find((v) => v.occasion)?.occasion;
  }
  return occ ? `전에 ${withRo(occ)} 방문했고 다시 가고 싶다고 남겼어요` : "전에 방문했고 다시 가고 싶다고 남겼어요";
}

/**
 * 새 후보의 이유. 결제 데이터 값 하나를 근거로 붙인다.
 * 회식, 접대를 골랐고 회식 적합 표시가 있으면 그 표시, 아니면 시군구 매출 상위 %, 그것도 없으면
 * 회식 적합 표시, 동네맛집 표시 순으로 있는 값을 쓴다. 아무 값도 없으면 근거 없이 "새 후보"만 쓴다.
 */
function freshReason(s: Store, occasion: Occasion | null, here: { lat: number; lng: number } | null): string {
  const head =
    here && s.lat !== null && s.lng !== null
      ? `${distanceText(distanceMeters(here, { lat: s.lat, lng: s.lng }))} 거리의 새 후보`
      : "근처의 새 후보";
  let basis: string | null = null;
  if (occasion && HOESIK_FIRST.includes(occasion) && s.hoesik === true) basis = "회식 적합 표시 있음";
  else if (s.ccgRank !== null) basis = `${s.sigungu} 매출 상위 ${pctLabel(s.ccgRank)}`;
  else if (s.hoesik === true) basis = "회식 적합 표시 있음";
  else if (s.local === true) basis = "동네맛집 표시 있음";
  return basis ? `${head}, ${basis}` : head;
}

/**
 * 다음 약속 후보.
 *
 * 관련 기록(revisit) 규칙
 * 1. reaction이 'again'이고 방문이 1회 이상인 기록만 본다. 저장만 한 기록, 'other' 기록은 들지 않는다.
 * 2. 범위: 그 매장이 지금 dataset에 있거나, 기록의 시군구가 dataset 매장의 시군구 중 하나와 같아야 한다.
 * 3. 순서: 모임 유형을 골랐으면 그 유형으로 방문한 기록이 먼저다(유형이 다른 기록도 뒤에 남는다.
 *    맞는 기록이 없으면 유형과 무관하게 같은 순서로 나온다). 그다음 dataset에 있는 매장이 먼저,
 *    그다음 최근 방문 순이다. 최대 REVISIT_LIMIT곳.
 * 관련 기록이 하나라도 있는지는 모임 유형, 시간 조건과 무관하다. 그래서 필터를 바꿔도 섹션이 접히지 않는다.
 *
 * 새 후보(fresh) 규칙
 * 1. dataset 매장 중 프랜차이즈가 아니고, 방문 기록이나 반응이 있는 매장이 아닌 곳(저장만 한 매장은 새 후보에 든다).
 *    'other'를 남긴 매장은 여기서 빠진다.
 * 2. 순서: 모임 유형이 회식이나 접대면 hoesik true가 먼저, 그다음 ccgRank 작은 순(null은 뒤), 같으면 API 순서.
 * 3. 최대 FRESH_LIMIT곳. here는 이유 문구의 거리 표기에만 쓰고 순서를 바꾸지 않는다.
 *
 * peakMatch는 peakMatches 규칙을 따른다.
 */
export function planNext(input: PlanInput): Plan {
  const occasion = input.occasion ?? null;
  const day = input.day ?? null;
  const time = input.time ?? null;
  const here = input.here ?? null;

  const datasetIds = new Set(input.stores.map((s) => s.id));
  const datasetSigungu = new Set(input.stores.map((s) => s.sigungu).filter((g) => g));

  const relevant = input.records.filter(
    (r) =>
      r.reaction === "again" &&
      r.visits.length > 0 &&
      (datasetIds.has(r.store.id) || (r.store.sigungu !== "" && datasetSigungu.has(r.store.sigungu))),
  );

  const rank = (r: VisitRecord) => [
    occasion && r.visits.some((v) => v.occasion === occasion) ? 0 : 1,
    datasetIds.has(r.store.id) ? 0 : 1,
  ];
  const revisit = [...relevant]
    .sort((a, b) => {
      const [a1, a2] = rank(a);
      const [b1, b2] = rank(b);
      if (a1 !== b1) return a1 - b1;
      if (a2 !== b2) return a2 - b2;
      const la = latestAt(a);
      const lb = latestAt(b);
      return la === lb ? 0 : la < lb ? 1 : -1;
    })
    .slice(0, REVISIT_LIMIT)
    .map((record) => ({
      record,
      reason: revisitReason(record, occasion),
      peakMatch: peakMatches(record.store, day, time),
    }));

  const recorded = new Set(
    input.records.filter((r) => r.visits.length > 0 || r.reaction !== null).map((r) => r.store.id),
  );
  const hoesikFirst = occasion !== null && HOESIK_FIRST.includes(occasion);
  const fresh = input.stores
    .map((store, i) => ({ store, i }))
    .filter(({ store }) => !store.franchise && !recorded.has(store.id))
    .sort((a, b) => {
      if (hoesikFirst) {
        const ha = a.store.hoesik === true ? 0 : 1;
        const hb = b.store.hoesik === true ? 0 : 1;
        if (ha !== hb) return ha - hb;
      }
      const ra = a.store.ccgRank ?? Number.POSITIVE_INFINITY;
      const rb = b.store.ccgRank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    })
    .slice(0, FRESH_LIMIT)
    .map(({ store }) => ({
      store,
      reason: freshReason(store, occasion, here),
      peakMatch: peakMatches(store, day, time),
    }));

  return { revisit, fresh };
}
