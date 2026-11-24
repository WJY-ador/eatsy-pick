// 상권 분석의 조회 범위(area 또는 loc, 그리고 조회 업종 food)와 URL 만들기. 페이지, 메타데이터, OG, 클라이언트가 같이 쓴다.

import { type Filters, filterEntries } from "@/lib/analytics";
import { areaBySlug } from "@/lib/areas";
import { foodDisplayName } from "@/lib/food";

export const DEFAULT_AREA = "gangnam";
const LOC_MAX = 30;
const FOOD_MAX = 20;
const STORE_MAX = 40;

/**
 * food는 잇플 조회에 넣는 업종(merTpbuzNm)이다. 홈의 음식 조건이 넘긴다.
 * 화면 필터 cat(받은 매장 안에서 다시 거르기)과 뜻이 다르다. 없으면 업종 없이 조회한다.
 */
export type Scope = ({ kind: "area"; slug: string; name: string } | { kind: "loc"; loc: string }) & {
  food?: string | null;
  /** 범위 안 가게 이름 조건(주소 q). 있으면 그 이름이 들어간 매장만 조회하고 프랜차이즈 제외를 걸지 않는다 */
  store?: string | null;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * area가 프리셋이면 그 상권, 아니면 loc(동네 이름), 둘 다 없으면 강남역.
 * area를 줬는데 모르는 값이고 loc도 없으면 강남역으로 가고 fellBack을 켠다.
 */
/** 업종 이름 꼴(한글, 영문, 숫자, 빗금, 공백)이 아니거나 길면 버린다 */
function parseFood(v: string | undefined): string | null {
  const t = v?.replace(/\s+/g, " ").trim();
  return t && t.length <= FOOD_MAX && /^[가-힣A-Za-z0-9/ ]+$/.test(t) ? t : null;
}

/** 가게 이름 조건(머리말 검색어). 공백을 정리하고 길면 버린다 */
function parseStore(v: string | undefined): string | null {
  const t = v?.replace(/\s+/g, " ").trim();
  return t && t.length <= STORE_MAX ? t : null;
}

export function parseScope(raw: RawParams): { scope: Scope; fellBack: boolean } {
  const food = parseFood(first(raw.food));
  const store = parseStore(first(raw.q));
  const areaRaw = first(raw.area)?.trim();
  const preset = areaBySlug(areaRaw);
  if (preset) return { scope: { kind: "area", slug: preset.slug, name: preset.name, food, store }, fellBack: false };
  const loc = first(raw.loc)?.trim();
  if (loc && loc.length <= LOC_MAX) return { scope: { kind: "loc", loc, food, store }, fellBack: false };
  const def = areaBySlug(DEFAULT_AREA)!;
  return { scope: { kind: "area", slug: def.slug, name: def.name, food, store }, fellBack: Boolean(areaRaw || loc) };
}

/** 이 범위에 실제로 거는 필터. 가게 이름 조건이면 프랜차이즈 제외를 끈다(스타벅스, 투썸처럼 이름으로 찾는 곳이 대개 프랜차이즈다) */
export function scopeFilters(scope: Scope, f: Filters): Filters {
  return scope.store ? { ...f, fr: false } : f;
}

export function scopeName(scope: Scope): string {
  return scope.kind === "area" ? scope.name : scope.loc;
}

/** 화면에 쓰는 조회 음식 이름(예 고기구이 → "고기/육류"). 조회 값(food)은 그대로 둔다. 없으면 null */
export function foodLabel(scope: Scope): string | null {
  return scope.food ? foodDisplayName(scope.food) : null;
}

/** 페이지 제목: "{조회 지역} {음식 화면 이름 }맛집 한눈에". 예 "동래역 고기/육류 맛집 한눈에" */
export function pageTitle(place: string, scope: Scope): string {
  const food = foodLabel(scope);
  return `${place} ${food ? `${food} ` : ""}맛집 한눈에`;
}

/** 페이지 소개 문장 */
export const PAGE_INTRO = "동네 가게를 카드 결제 데이터로 비교해 보세요.";

export function loadInput(scope: Scope): { area?: string; loc?: string; category?: string; name?: string } {
  const place = scope.kind === "area" ? { area: scope.slug } : { loc: scope.loc };
  return { ...place, ...(scope.food ? { category: scope.food } : {}), ...(scope.store ? { name: scope.store } : {}) };
}

function scopeEntry(scope: Scope): [string, string] {
  return scope.kind === "area" ? ["area", scope.slug] : ["loc", scope.loc];
}

/** 조회 범위의 주소 값. food는 area나 loc 바로 뒤, 가게 이름(q)은 그 뒤에 둔다 */
function scopeEntries(scope: Scope): [string, string][] {
  const e: [string, string][] = [scopeEntry(scope)];
  if (scope.food) e.push(["food", scope.food]);
  if (scope.store) e.push(["q", scope.store]);
  return e;
}

/** 이름 조건에서는 프랜차이즈 제외를 걸지 않으므로 fr을 주소에 싣지 않는다(해제한 뒤 원래 설정으로 돌아간다) */
function query(scope: Scope, f: Filters | null): string {
  const fe = f ? filterEntries(f).filter(([k]) => !(scope.store && k === "fr")) : [];
  return new URLSearchParams([...scopeEntries(scope), ...fe]).toString();
}

/** 상권과 실제 적용한 필터를 복원하는 경로. 좌표와 개인 기록은 넣지 않는다. */
export function analysisPath(scope: Scope, f: Filters | null): string {
  return `/analysis?${query(scope, f)}`;
}

export function ogPath(scope: Scope, f: Filters | null): string {
  return `/og/analysis?${query(scope, f)}`;
}

/** 홈의 영수증으로 가는 링크 */
export function receiptHref(scope: Scope, store: { name: string; id: string }): string {
  return `/?${new URLSearchParams([scopeEntry(scope), ["q", store.name], ["id", store.id]]).toString()}`;
}
