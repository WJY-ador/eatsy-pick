// 홈 URL 계약. 서버 page와 클라이언트가 같이 쓴다. Next 전용 API와 proj4를 import하지 않는다.
//   area=<slug> | loc=<동네>(+ near=1) | q=<음식, 매장 검색>&id=<Store.id> | fr=0 | d=<거리 구간 0~3>
//   옛 링크의 occ, n은 읽지 않는다.

import { AREAS, areaBySlug, normalizePlace } from "./areas";
import { foodCategory } from "./food";

export const DEFAULT_SLUG = "gangnam";
const LOC_MAX = 30;
const Q_MAX = 40;

export type HomeScope = { kind: "area"; slug: string; name: string } | { kind: "loc"; loc: string };

export type HomeQuery = {
  scope: HomeScope;
  /** 쿼리 없는 첫 진입(강남역 예시) */
  isDefault: boolean;
  near: boolean;
  q: string | null;
  /** 음식 검색어가 대응표에 있으면 그 업종(이때 q는 null, foodTerm에 원래 말) */
  food: string | null;
  foodTerm: string | null;
  id: string | null;
  /** 프랜차이즈 제외(기본 true, fr=0이면 false) */
  excludeFranchise: boolean;
  /** 거리 구간(0: 300m 이내, 1: 300~600m, 2: 600m~1km, 3: 1km 이상). 없으면 null */
  band: number | null;
};

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | undefined, max: number): string | null {
  if (!v) return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
}

/** 검색어가 프리셋 상권 이름이나 별칭이면 그 slug */
export function presetFor(input: string): string | null {
  const key = normalizePlace(input);
  if (!key) return null;
  const a = AREAS.find((p) => p.slug === key || p.aliases.includes(key) || normalizePlace(p.name) === key);
  return a ? a.slug : null;
}

/**
 * 지명 꼴인가. 상호와 겹치지 않게 좁게 본다(스시, 냉면, 우동 같은 상호 끝말은 지명으로 읽지 않는다).
 * 동: 세 글자 이상(역삼동, 망원동, 역삼1동), 가: 성수동2가, 을지로3가, 구: 마포구, 강남구
 */
export function looksLikePlace(input: string): boolean {
  const v = input.trim();
  if (/\s/.test(v)) return false;
  if (/^[가-힣]{2,5}\d?동$/.test(v)) return !/우동$/.test(v);
  if (/^[가-힣]{1,5}동?\d{1,2}가$/.test(v)) return true;
  return /^[가-힣]{2,3}구$/.test(v);
}

function areaScope(slug: string): HomeScope {
  const a = areaBySlug(slug) ?? areaBySlug(DEFAULT_SLUG)!;
  return { kind: "area", slug: a.slug, name: a.name };
}

export function parseHome(raw: Raw): HomeQuery {
  const area = areaBySlug(clean(first(raw.area), 40));
  const loc = clean(first(raw.loc), LOC_MAX);
  let q = clean(first(raw.q), Q_MAX);
  let scope: HomeScope | null = area ? areaScope(area.slug) : loc ? { kind: "loc", loc } : null;
  const id = clean(first(raw.id), 80);
  // 검색어가 지명이면 상권 전환으로 읽는다(스크립트 없이 폼을 보내도 같은 결과).
  // id가 있으면 q는 매장 이름이다(상권 분석에서 온 영수증 링크).
  let food: string | null = null;
  let foodTerm: string | null = null;
  if (q && !id) {
    const preset = presetFor(q);
    if (preset) {
      scope = areaScope(preset);
      q = null;
    } else if (looksLikePlace(q)) {
      // 행정동 꼴(역삼1동)은 API 주소의 법정동 꼴(역삼동)로 맞춘다.
      scope = { kind: "loc", loc: q.replace(/^(.+?)\d+동$/, "$1동") };
      q = null;
    } else if (foodCategory(q)) {
      food = foodCategory(q);
      foodTerm = q;
      q = null;
    }
  }
  const isDefault = scope === null && !food;
  return {
    scope: scope ?? areaScope(DEFAULT_SLUG),
    isDefault,
    near: first(raw.near) === "1" && !isDefault,
    q,
    food,
    foodTerm,
    id,
    excludeFranchise: first(raw.fr) !== "0",
    band: /^[0-3]$/.test(first(raw.d) ?? "") ? Number(first(raw.d)) : null,
  };
}

export function scopeInput(scope: HomeScope): { area?: string; loc?: string } {
  return scope.kind === "area" ? { area: scope.slug } : { loc: scope.loc };
}

export function scopeEntries(scope: HomeScope): [string, string][] {
  return scope.kind === "area" ? [["area", scope.slug]] : [["loc", scope.loc]];
}

/** 홈 경로. 좌표는 어떤 경우에도 넣지 않는다 */
export function homeHref(
  scope: HomeScope,
  o: { near?: boolean; q?: string | null; id?: string | null; excludeFranchise?: boolean; band?: number | null } = {},
): string {
  const e: [string, string][] = scopeEntries(scope);
  if (o.near) e.push(["near", "1"]);
  if (o.q) e.push(["q", o.q]);
  if (o.id) e.push(["id", o.id]);
  if (o.excludeFranchise === false) e.push(["fr", "0"]);
  if (o.band !== undefined && o.band !== null) e.push(["d", String(o.band)]);
  return `/?${new URLSearchParams(e).toString()}`;
}

/** 상권 분석으로 현재 범위를 넘기는 경로 */
export function analysisHref(scope: HomeScope): string {
  return `/analysis?${new URLSearchParams(scopeEntries(scope)).toString()}`;
}

export function scopeName(scope: HomeScope): string {
  return scope.kind === "area" ? scope.name : scope.loc;
}
