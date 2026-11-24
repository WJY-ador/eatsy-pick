// 내 저장 패턴과 비슷한 곳. 규칙 기반 순수 함수다(같은 입력이면 같은 결과, records 배열 순서와 무관).
// 긍정 신호: 저장됐고 단계가 가고 싶은 곳, 방문 예정, 단골인 기록. 보류와 저장 해제된 기록은 쓰지 않는다.
// 후보에서 빼는 것: 이미 저장한 매장(보류 포함), 반응이 "other"(다른 곳 볼래요)인 매장(저장 여부와 무관).
// 점수(내부용, 화면에 내지 않는다): 업종 일치 55, 지역 매출 백분위 구간 같음 25, 주 고객층 1위(rk01) 같음 15,
// 대표 결제 피크(요일과 시간대) 같음 5. 업종이 일치하지 않으면 다른 근거가 맞아도 추천하지 않는다.
// 백분위, 고객층, 피크는 양쪽 값이 확인될 때만 비교한다(없는 값은 일치도 불일치도 아니다).

import type { Store } from "./stores";
import { bySavedAt } from "./taste";
import { customer1Label } from "./themes";
import { type VisitRecord, isSaved } from "./visits";

export type Recommendation = { store: Store; reason: string };
export type RecommendResult = { items: Recommendation[]; basis: number; note: string | null };

export const RECOMMEND_LIMIT = 8;
export const ONE_BASIS_NOTE = "저장한 한 곳을 참고했어요";

const W_CATEGORY = 55;
const W_BAND = 25;
const W_CUSTOMER = 15;
const W_PEAK = 5;

/** 지역 매출 백분위 구간: 1 이하, 5 이하, 20 이하, 그 밖. 값이 없으면 null(비교하지 않는다) */
function band(store: Store): number | null {
  const r = store.ccgRank;
  if (typeof r !== "number" || !Number.isFinite(r)) return null;
  if (r <= 1) return 0;
  if (r <= 5) return 1;
  if (r <= 20) return 2;
  return 3;
}

/** 요일과 시간대가 둘 다 있을 때만 대표 피크로 본다 */
function peak(store: Store): string | null {
  const d = store.peakDay?.trim();
  const t = store.peakTime?.trim();
  return d && t ? `${d}|${t}` : null;
}

type Match = { band: boolean; customer: boolean; peak: boolean };

/** 업종이 일치할 때만 Match를 돌려준다. 업종이 다르거나 어느 쪽이든 비었으면 null */
function compare(c: Store, s: Store): Match | null {
  const cc = c.category.trim();
  if (cc === "" || cc !== s.category.trim()) return null;
  const cb = band(c);
  const sb = band(s);
  const cu = customer1Label(c);
  const su = customer1Label(s);
  const cp = peak(c);
  const sp = peak(s);
  return {
    band: cb !== null && cb === sb,
    customer: cu !== null && cu === su,
    peak: cp !== null && cp === sp,
  };
}

function scoreOf(m: Match): number {
  return W_CATEGORY + (m.band ? W_BAND : 0) + (m.customer ? W_CUSTOMER : 0) + (m.peak ? W_PEAK : 0);
}

/**
 * 실제로 일치한 근거만으로 만든 한 줄. 업종은 항상 일치한 상태다.
 * 점수, 퍼센트, 적합도를 넣지 않는다. 피크는 과거 결제 패턴 비교일 뿐 대기나 예약으로 풀이하지 않는다.
 */
function reasonOf(category: string, m: Match): string {
  const same = [m.customer ? "주 고객층 1위" : null, m.peak ? "대표 결제 피크" : null].filter((v): v is string => v !== null);
  if (same.length === 0) {
    return m.band ? `${category} 업종이고 지역 매출 순위 구간이 비슷해요` : `저장한 곳과 같은 ${category} 업종`;
  }
  const head = `${category} 업종과 ${same.join(", ")}가`;
  return m.band ? `${head} 같고 지역 매출 순위 구간도 비슷해요` : `${head} 같아요`;
}

export function recommend(candidates: Store[], records: VisitRecord[], limit: number = RECOMMEND_LIMIT): RecommendResult {
  // 먼저 저장한 순으로 고정해 같은 점수의 대표 저장 매장이 records 순서에 따라 바뀌지 않게 한다.
  const positives = records.filter((r) => isSaved(r) && r.stage !== "hold").sort(bySavedAt);
  const basis = positives.length;
  const note = basis === 1 ? ONE_BASIS_NOTE : null;
  if (basis === 0) return { items: [], basis, note };

  const excluded = new Set<string>();
  for (const r of records) {
    if (isSaved(r) || r.reaction === "other") excluded.add(r.store.id);
  }

  const scored: { store: Store; reason: string; score: number; repeat: number; index: number }[] = [];
  const seen = new Set<string>();
  candidates.forEach((store, index) => {
    if (seen.has(store.id) || excluded.has(store.id)) return;
    seen.add(store.id);
    let best: Match | null = null;
    let bestScore = -1;
    // 같은 패턴이 반복된 저장 매장 수: 이 후보와 최고 점수를 낸 긍정 저장 매장 수.
    // 가중치 조합의 합이 모두 달라 같은 점수는 같은 근거 집합이다.
    let repeat = 0;
    for (const p of positives) {
      const m = compare(store, p.store);
      if (!m) continue;
      const sc = scoreOf(m);
      if (sc > bestScore) {
        best = m;
        bestScore = sc;
        repeat = 1;
      } else if (sc === bestScore) {
        repeat++;
      }
    }
    if (!best) return;
    scored.push({ store, reason: reasonOf(store.category.trim(), best), score: bestScore, repeat, index });
  });

  // 정렬: 점수 내림차순 → 반복된 저장 매장 수 내림차순 → 입력 순서
  scored.sort((a, b) => b.score - a.score || b.repeat - a.repeat || a.index - b.index);
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  return { items: scored.slice(0, n).map(({ store, reason }) => ({ store, reason })), basis, note };
}
