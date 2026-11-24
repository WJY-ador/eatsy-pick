// 홈의 내 미식 CRM 요약 집계. 순수 함수다(같은 입력이면 같은 결과, 넘겨받은 배열 순서와 무관).
// 이 값은 사용자가 저장한 매장의 BC카드 특성이다. 개인 결제 내역이나 방문 만족도가 아니다.
// 단계별 수는 저장된 기록 전부(보류 포함). 취향 요약(basis, avgRank, topCategory, topCustomer)은 보류를 뺀다.
// 저장 해제된 기록(savedAt null)은 어디에도 넣지 않는다.

import type { Store } from "./stores";
import { customer1Label } from "./themes";
import { STAGES, type Stage, type VisitRecord, isSaved } from "./visits";

export type TasteSummary = {
  /** 저장된 기록의 단계별 수(보류 포함) */
  stageCounts: Record<Stage, number>;
  /** 저장된 기록 수 */
  saved: number;
  /** 취향 요약에 쓴 수(저장됐고 보류가 아닌 것) */
  basis: number;
  /** ccgRank(지역 매출 백분위)의 산술 평균과 적용한 매장 수. 반올림은 화면이 한다 */
  avgRank: { value: number; n: number } | null;
  /** 가장 많이 저장한 업종(BC카드 업종 원문) */
  topCategory: { label: string; count: number } | null;
  /** 원본 rk01(customer1)에 가장 자주 나온 고객층. known은 customer1이 확인된 매장 수(분모) */
  topCustomer: { label: string; count: number; known: number } | null;
};

/** 결정적 순서: 먼저 저장한 순, 같으면 매장 id 코드포인트 순 */
export function bySavedAt(a: VisitRecord, b: VisitRecord): number {
  const sa = a.savedAt ?? "";
  const sb = b.savedAt ?? "";
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.store.id < b.store.id ? -1 : a.store.id > b.store.id ? 1 : 0;
}

/**
 * 최빈값. 동률이면 그 값을 가진 기록 중 가장 먼저 저장한 쪽이 이긴다.
 * items는 bySavedAt 순이어야 한다(첫 등장 순서가 곧 가장 이른 저장 순서다).
 */
function mode(items: string[]): { label: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of items) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { label: string; count: number } | null = null;
  // Map은 첫 등장 순서로 돈다. 더 큰 수만 갈아 끼우므로 동률이면 먼저 저장한 값이 남는다.
  for (const [label, count] of counts) {
    if (!best || count > best.count) best = { label, count };
  }
  return best;
}

function rankOf(store: Store): number | null {
  const r = store.ccgRank;
  return typeof r === "number" && Number.isFinite(r) ? r : null;
}

export function tasteSummary(records: VisitRecord[]): TasteSummary {
  const saved = records.filter((r) => isSaved(r)).sort(bySavedAt);
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<Stage, number>;
  for (const r of saved) {
    if (r.stage in stageCounts) stageCounts[r.stage]++;
  }

  const basisRecs = saved.filter((r) => r.stage !== "hold");

  const ranks = basisRecs.map((r) => rankOf(r.store)).filter((v): v is number => v !== null);
  const avgRank = ranks.length > 0 ? { value: ranks.reduce((a, b) => a + b, 0) / ranks.length, n: ranks.length } : null;

  const topCategory = mode(basisRecs.map((r) => r.store.category.trim()).filter((c) => c !== ""));

  // 옛 스냅샷은 customer1이 없다. 미확인으로 두고 customers[0]으로 대신하지 않는다.
  const customers = basisRecs.map((r) => customer1Label(r.store)).filter((v): v is string => v !== null);
  const topCust = mode(customers);
  const topCustomer = topCust ? { ...topCust, known: customers.length } : null;

  return { stageCounts, saved: saved.length, basis: basisRecs.length, avgRank, topCategory, topCustomer };
}
