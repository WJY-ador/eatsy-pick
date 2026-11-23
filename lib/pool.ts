// 결정기와 상권 리포트가 같이 쓰는 후보 다듬기: 병렬 조회, 시군구 필터, 비실명 제외, 중복 제거, 반경.

import { type AreaPreset, RADIUS_STEPS } from "./areas";
import type { EatplItem, SearchFn, SearchParams } from "./eatpl";
import { UpstreamError } from "./eatpl";
import { normalizeName } from "./franchise";

export const CALL_BUDGET = 12;
export const MAX_DONGS = 3;
export const CONCURRENCY = 5;

export type CallStats = { planned: number; succeeded: number; failed: number; rateLimited: boolean; queries: SearchParams[] };

/**
 * 조회 계획. 동은 중심에 가까운 순으로 최대 maxDongs개, 업종은 예산에 맞춰 목록 앞쪽부터 남긴다.
 * 예산 12: 동 3개면 업종 4개, 동 2개나 1개면 업종 6개까지.
 */
export function planGrid(places: string[], categories: string[], opts: { budget?: number; maxDongs?: number } = {}): SearchParams[] {
  const budget = opts.budget ?? CALL_BUDGET;
  const dongs = places.slice(0, Math.max(1, opts.maxDongs ?? MAX_DONGS));
  const perDong = Math.max(1, Math.min(categories.length, Math.floor(budget / Math.max(1, dongs.length))));
  const cats = categories.slice(0, perDong);
  const out: SearchParams[] = [];
  for (const location of dongs) for (const merTpbuzNm of cats) out.push({ location, merTpbuzNm });
  return out.slice(0, budget);
}

async function runPool<T, R>(tasks: T[], limit: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      try {
        results[idx] = { status: "fulfilled", value: await fn(tasks[idx]) };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** 계획대로 조회한다. 실패(429 포함)는 재시도하지 않고 센다. */
export async function fetchAll(queries: SearchParams[], search: SearchFn): Promise<{ items: EatplItem[]; calls: CallStats; firstError: unknown }> {
  const settled = await runPool(queries, CONCURRENCY, (q) => search(q));
  const ok = settled.filter((s): s is PromiseFulfilledResult<EatplItem[]> => s.status === "fulfilled");
  const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
  return {
    items: ok.flatMap((s) => s.value),
    calls: {
      planned: queries.length,
      succeeded: ok.length,
      failed: rejected.length,
      rateLimited: rejected.some((s) => s.reason instanceof UpstreamError && s.reason.status === 429),
      queries,
    },
    firstError: rejected[0]?.reason,
  };
}

/** "서울특별시 강남구 ..." → "강남구", "경기 성남시 분당구 ..." → "성남시" */
export function sigunguOf(addr: string): string {
  return addr.trim().split(/\s+/)[1] ?? "";
}

function addrKey(addr: string): string {
  return addr
    .replace(/^서울특별시/, "서울")
    .replace(/^경기도/, "경기")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .replace(/[,(].*$/, "");
}

export function rankOf(it: EatplItem): number {
  return typeof it.ccgSaleRnk === "number" ? it.ccgSaleRnk : 100;
}

/** 이름 + 주소 앞부분으로 중복 제거. 시군구 순위가 좋은 쪽을 남긴다. */
export function dedupe(items: EatplItem[]): EatplItem[] {
  const best = new Map<string, EatplItem>();
  for (const it of items) {
    const key = `${normalizeName(it.merNm)}|${addrKey(it.merAddr)}`;
    const prev = best.get(key);
    if (!prev || rankOf(it) < rankOf(prev)) best.set(key, it);
  }
  return [...best.values()];
}

const GENERIC_NAME = /^(일반)?(한식|중식|일식|양식|분식|대중|휴게)?(음식점|식당|주점)$|^(일반)?(한식|중식|일식|양식|분식)점$|^일반\S*점$/;

/** 비실명 가맹점: 이름에 밑줄이 있거나 업종 일반명으로만 된 것("일반한식점(구)_NICE_A" 등) */
export function isUnnamedMerchant(name: string): boolean {
  if (name.includes("_")) return true;
  const n = name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "");
  return n.length === 0 || GENERIC_NAME.test(n);
}

/** 시군구 필터(프리셋일 때), 비실명 제외, 중복 제거 */
export function cleanItems(items: EatplItem[], area?: AreaPreset): EatplItem[] {
  let out = items.filter((it) => !isUnnamedMerchant(it.merNm));
  if (area) {
    const allowed = new Set(area.sigungu);
    out = out.filter((it) => allowed.has(sigunguOf(it.merAddr)));
  }
  return dedupe(out);
}

export function distanceFrom(area: AreaPreset | undefined, it: EatplItem): number | null {
  if (!area) return null;
  const x = Number(it.xaxsVal);
  const y = Number(it.yaxsVal);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;
  return Math.hypot(x - area.center.x, y - area.center.y);
}

/**
 * 반경 필터. 700m부터 1000, 1500, 무제한 순으로 넓히며, counts(조건에 맞는 후보)가 need 이상인 첫 반경을 쓴다.
 * 프리셋이 아니면(자유 입력) 반경 없이 전부.
 */
export function withinRadius<T extends { distanceM: number | null }>(
  all: T[],
  area: AreaPreset | undefined,
  need: number,
  counts: (c: T) => boolean = () => true,
): { pool: T[]; radius: number | null } {
  if (!area) return { pool: all, radius: null };
  for (const step of RADIUS_STEPS) {
    const within = step === null ? all : all.filter((c) => c.distanceM !== null && c.distanceM <= step);
    if (step === null || within.filter(counts).length >= need) return { pool: within, radius: step };
  }
  return { pool: all, radius: null };
}
