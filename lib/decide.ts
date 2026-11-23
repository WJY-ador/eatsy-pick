// 결정기: (동 × 업종) 병렬 조회 → 시군구 필터, 비실명 제외, 중복 제거 → 반경 → 점수 정렬 → 3곳 선정.
// 결정적이다. 같은 입력이면 같은 3곳이 나온다(무작위 없음).

import { type EatplItem, type SearchFn, searchEatpl } from "./eatpl";
import { isFranchise } from "./franchise";
import { type Occasion, evaluate, occasionBySlug } from "./occasions";
import { type CallStats, cleanItems, distanceFrom, fetchAll, planGrid, rankOf, sigunguOf, withinRadius } from "./pool";
import type { DecideInput } from "./query";

export { CALL_BUDGET } from "./pool";
export type { CallStats } from "./pool";
export const PICKS_PER_PAGE = 3;
/** 시군구 상위 이 % 밖은 프랜차이즈처럼 뒤로 내린다 */
export const LOW_RANK_CUTOFF = 50;

export type Choice = {
  item: EatplItem;
  /** 1부터 시작하는 순번(묶음 번호 반영) */
  rank: number;
  sigungu: string;
  distanceM: number | null;
  fit: { met: string[]; total: number; bonus: number };
  franchise: boolean;
  /** 0: 앞, 1: 시군구 상위 50% 밖, 2: 프랜차이즈(제외 켬일 때) */
  tier: 0 | 1 | 2;
  score: number;
};

export type Decision =
  | { status: "error"; input: DecideInput; calls: CallStats; reason: string; rateLimited: boolean }
  | {
      status: "empty" | "ok";
      input: DecideInput;
      calls: CallStats;
      picks: Choice[];
      /** 마지막 묶음에 쓰인 반경(m). null이면 무제한이나 반경 없음 */
      radius: number | null;
      /** 시군구 필터, 비실명 제외, 중복 제거 뒤 후보 수 */
      candidates: number;
      hasMore: boolean;
    };

/** 조회 계획: 프리셋이면 가까운 동 최대 3개, 자유 입력이면 입력 그대로 1개. 예산 12건. */
export function planQueries(input: DecideInput, occ: Occasion) {
  const places = input.area ? input.area.dongs : input.q ? [input.q] : [];
  return planGrid(places, occ.categories);
}

/**
 * 점수: 조건 하나에 2점, 모임별 가점(회식의 회식 적합 표시 4점), 시군구 순위 (100 - ccgSaleRnk) / 10 (0~10점).
 * 조건 하나 차이가 순위 20%p 차이와 같다.
 */
export function scoreOf(met: number, bonus: number, ccg: number): number {
  return met * 2 + bonus + (100 - ccg) / 10;
}

type Candidate = Omit<Choice, "rank">;

function compare(a: Candidate, b: Candidate): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (b.score !== a.score) return b.score - a.score;
  const ra = rankOf(a.item);
  const rb = rankOf(b.item);
  if (ra !== rb) return ra - rb;
  return a.item.merNm.localeCompare(b.item.merNm, "ko");
}

/** 정렬된 목록에서 k곳. 앞 단계(tier) 안에서 업종이 겹치지 않게 먼저 고르고, 모자라면 완화한 뒤 다음 단계로 간다. */
function selectPage(sorted: Candidate[], k: number): Candidate[] {
  const out: Candidate[] = [];
  const taken = new Set<Candidate>();
  for (const tier of [0, 1, 2] as const) {
    const group = sorted.filter((c) => c.tier === tier);
    const cats = new Set(out.map((c) => c.item.merTpbuzNm));
    for (const c of group) {
      if (out.length >= k) break;
      if (cats.has(c.item.merTpbuzNm)) continue;
      out.push(c);
      taken.add(c);
      cats.add(c.item.merTpbuzNm);
    }
    for (const c of group) {
      if (out.length >= k) break;
      if (taken.has(c)) continue;
      out.push(c);
      taken.add(c);
    }
    if (out.length >= k) break;
  }
  return out;
}

export async function decide(input: DecideInput, search: SearchFn = searchEatpl): Promise<Decision> {
  const occ = occasionBySlug(input.occ);
  if (!occ) throw new Error(`unknown occasion ${input.occ}`);
  const queries = planQueries(input, occ);
  const { items, calls, firstError } = await fetchAll(queries, search);
  if (queries.length > 0 && calls.succeeded === 0) {
    return { status: "error", input, calls, reason: String(firstError ?? "unknown"), rateLimited: calls.rateLimited };
  }

  const all: Candidate[] = cleanItems(items, input.area).map((item) => {
    const fit = evaluate(occ, item);
    const franchise = isFranchise(item.merNm, item.merTpbuzNm);
    const tier: Candidate["tier"] = input.excludeFranchise && franchise ? 2 : rankOf(item) > LOW_RANK_CUTOFF ? 1 : 0;
    return {
      item,
      sigungu: sigunguOf(item.merAddr),
      distanceM: distanceFrom(input.area, item),
      fit,
      franchise,
      tier,
      score: scoreOf(fit.met.length, fit.bonus, rankOf(item)),
    };
  });

  // 묶음을 1번부터 차례로 만든다. 묶음마다 앞 단계(tier 0) 후보가 3 × 묶음 번호 곳 찰 때까지 반경을 넓힌다.
  const picked = new Set<Candidate>();
  let page: Candidate[] = [];
  let radius: number | null = null;
  for (let p = 1; p <= input.n; p++) {
    const r = withinRadius(all, input.area, PICKS_PER_PAGE * p, (c) => c.tier === 0);
    radius = r.radius;
    const rest = r.pool.filter((c) => !picked.has(c)).sort(compare);
    page = selectPage(rest, PICKS_PER_PAGE);
    page.forEach((c) => picked.add(c));
    if (page.length === 0) break;
  }

  const offset = PICKS_PER_PAGE * (input.n - 1);
  const picks: Choice[] = page.map((c, i) => ({ ...c, rank: offset + i + 1 }));
  return {
    status: picks.length > 0 ? "ok" : "empty",
    input,
    calls,
    picks,
    radius,
    candidates: all.length,
    hasMore: all.length > picked.size,
  };
}
