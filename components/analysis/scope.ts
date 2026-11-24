// 상권 분석의 조회 범위(area 또는 loc, 그리고 조회 업종 food)와 URL 만들기. 페이지, 메타데이터, OG, 클라이언트가 같이 쓴다.

import { type Filters, filterEntries } from "@/lib/analytics";
import { areaBySlug } from "@/lib/areas";

export const DEFAULT_AREA = "gangnam";
const LOC_MAX = 30;
const FOOD_MAX = 20;

/**
 * food는 잇플 조회에 넣는 업종(merTpbuzNm)이다. 홈의 음식 조건이 넘긴다.
 * 화면 필터 cat(받은 매장 안에서 다시 거르기)과 뜻이 다르다. 없으면 업종 없이 조회한다.
 */
export type Scope = ({ kind: "area"; slug: string; name: string } | { kind: "loc"; loc: string }) & { food?: string | null };

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

export function parseScope(raw: RawParams): { scope: Scope; fellBack: boolean } {
  const food = parseFood(first(raw.food));
  const areaRaw = first(raw.area)?.trim();
  const preset = areaBySlug(areaRaw);
  if (preset) return { scope: { kind: "area", slug: preset.slug, name: preset.name, food }, fellBack: false };
  const loc = first(raw.loc)?.trim();
  if (loc && loc.length <= LOC_MAX) return { scope: { kind: "loc", loc, food }, fellBack: false };
  const def = areaBySlug(DEFAULT_AREA)!;
  return { scope: { kind: "area", slug: def.slug, name: def.name, food }, fellBack: Boolean(areaRaw || loc) };
}

export function scopeName(scope: Scope): string {
  return scope.kind === "area" ? scope.name : scope.loc;
}

export function loadInput(scope: Scope): { area?: string; loc?: string; category?: string } {
  const place = scope.kind === "area" ? { area: scope.slug } : { loc: scope.loc };
  return scope.food ? { ...place, category: scope.food } : place;
}

function scopeEntry(scope: Scope): [string, string] {
  return scope.kind === "area" ? ["area", scope.slug] : ["loc", scope.loc];
}

/** 조회 범위의 주소 값. food는 area나 loc 바로 뒤에 둔다 */
function scopeEntries(scope: Scope): [string, string][] {
  return scope.food ? [scopeEntry(scope), ["food", scope.food]] : [scopeEntry(scope)];
}

function query(scope: Scope, f: Filters | null): string {
  return new URLSearchParams([...scopeEntries(scope), ...(f ? filterEntries(f) : [])]).toString();
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
