// 상권 결제 랭킹 리포트(/area). 결정기와 같은 후보 다듬기와 반경 함수를 쓴다.
// 순서는 ccgSaleRnk 오름차순(조건 점수 없음). 프랜차이즈는 뒤로 내리고, 비실명 가맹점은 뺀다.
// Next 전용 API를 import하지 않는다(검색 함수는 인자로 받는다).

import type { AreaPreset } from "./areas";
import type { EatplItem, SearchFn, SearchParams } from "./eatpl";
import { isFranchise } from "./franchise";
import { WEEKDAYS, customerLabel } from "./labels";
import { type CallStats, cleanItems, distanceFrom, fetchAll, planGrid, rankOf, sigunguOf, withinRadius } from "./pool";

export type Group = { slug: string; name: string; categories: string[] };

export const GROUPS: Group[] = [
  { slug: "gogi", name: "고기구이", categories: ["고기구이"] },
  { slug: "hansik", name: "백반, 찜, 탕", categories: ["백반/한정식", "찜/탕/찌개"] },
  { slug: "ilsik", name: "스시, 일식", categories: ["스시/초밥", "기타일식"] },
  { slug: "sul", name: "호프, 이자카야", categories: ["호프", "이자카야"] },
  { slug: "myeon", name: "국수, 면, 만두", categories: ["국수/면/만두"] },
  { slug: "cafe", name: "카페", categories: ["카페"] },
];

const BY_SLUG = new Map(GROUPS.map((g) => [g.slug, g]));
export function groupBySlug(slug: string | undefined | null): Group | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export type Row = { item: EatplItem; sigungu: string; distanceM: number | null; franchise: boolean };

function toRows(items: EatplItem[], area: AreaPreset): Row[] {
  return cleanItems(items, area).map((item) => ({
    item,
    sigungu: sigunguOf(item.merAddr),
    distanceM: distanceFrom(area, item),
    franchise: isFranchise(item.merNm, item.merTpbuzNm),
  }));
}

function rankRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (a.franchise !== b.franchise) return a.franchise ? 1 : -1;
    const d = rankOf(a.item) - rankOf(b.item);
    return d !== 0 ? d : a.item.merNm.localeCompare(b.item.merNm, "ko");
  });
}

export type GroupTop = { group: Group; rows: Row[]; radius: number | null; pool: number };

export type AreaReport = { area: AreaPreset; groups: GroupTop[]; calls: CallStats };

/** 상권 리포트: 묶음마다 대표 업종(첫 업종) 1개 × 가까운 동 2개 = 최대 12건. 묶음별 상위 5곳. */
export async function areaReport(area: AreaPreset, search: SearchFn): Promise<AreaReport> {
  const reps = GROUPS.map((g) => g.categories[0]);
  const dongs = area.dongs.slice(0, 2);
  const queries: SearchParams[] = [];
  for (const location of dongs) for (const merTpbuzNm of reps) queries.push({ location, merTpbuzNm });
  const { items, calls } = await fetchAll(queries.slice(0, 12), search);
  const groups = GROUPS.map((group) => {
    const rows = toRows(
      items.filter((it) => it.merTpbuzNm === group.categories[0]),
      area,
    );
    const r = withinRadius(rows, area, 5, (x) => !x.franchise);
    return { group, rows: rankRows(r.pool).slice(0, 5), radius: r.radius, pool: r.pool.length };
  });
  return { area, groups, calls };
}

export type Tally = { label: string; count: number }[];

export type GroupReport = {
  area: AreaPreset;
  group: Group;
  rows: Row[];
  radius: number | null;
  /** 반경 안 표본 수(요약의 n) */
  sample: number;
  summary: { days: Tally; times: Tally; customers: Tally } | null;
  calls: CallStats;
};

export const MIN_SAMPLE = 5;
const DAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];
const TIME_ORDER = ["오전", "점심", "오후", "저녁", "심야", "새벽"];

function tally(values: (string | undefined)[], order?: string[]): Tally {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  const out = [...m.entries()].map(([label, count]) => ({ label, count }));
  return out.sort((a, b) => b.count - a.count || (order ? order.indexOf(a.label) - order.indexOf(b.label) : a.label.localeCompare(b.label, "ko")));
}

/** 묶음 페이지: 업종 최대 2 × 동 최대 3 = 최대 6건. 상위 20곳과 표본에서 센 분포. */
export async function groupReport(area: AreaPreset, group: Group, search: SearchFn): Promise<GroupReport> {
  const queries = planGrid(area.dongs, group.categories, { budget: 6, maxDongs: 3 });
  const { items, calls } = await fetchAll(queries, search);
  const rows = toRows(items, area);
  const r = withinRadius(rows, area, 20, (x) => !x.franchise);
  const sample = r.pool.length;
  const summary =
    sample >= MIN_SAMPLE
      ? {
          days: tally(r.pool.map((x) => x.item.congestionDwk), DAY_ORDER),
          times: tally(r.pool.map((x) => x.item.congestionTizn), TIME_ORDER),
          customers: tally(r.pool.map((x) => (x.item.vistCstmrRnkList?.rk01 ? customerLabel(x.item.vistCstmrRnkList.rk01) : undefined))),
        }
      : null;
  return { area, group, rows: rankRows(r.pool).slice(0, 20), radius: r.radius, sample, summary, calls };
}

/** 평일 피크 곳 수(요약 문장용) */
export function weekdayCount(t: Tally): number {
  return t.filter((x) => (WEEKDAYS as readonly string[]).includes(x.label)).reduce((s, x) => s + x.count, 0);
}
