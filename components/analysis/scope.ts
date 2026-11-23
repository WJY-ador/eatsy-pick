// 상권 분석의 조회 범위(area 또는 loc)와 URL 만들기. 페이지, 메타데이터, OG, 클라이언트가 같이 쓴다.

import { type Filters, filterEntries } from "@/lib/analytics";
import { areaBySlug } from "@/lib/areas";

export const DEFAULT_AREA = "gangnam";
const LOC_MAX = 30;

export type Scope = { kind: "area"; slug: string; name: string } | { kind: "loc"; loc: string };

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * area가 프리셋이면 그 상권, 아니면 loc(동네 이름), 둘 다 없으면 강남역.
 * area를 줬는데 모르는 값이고 loc도 없으면 강남역으로 가고 fellBack을 켠다.
 */
export function parseScope(raw: RawParams): { scope: Scope; fellBack: boolean } {
  const areaRaw = first(raw.area)?.trim();
  const preset = areaBySlug(areaRaw);
  if (preset) return { scope: { kind: "area", slug: preset.slug, name: preset.name }, fellBack: false };
  const loc = first(raw.loc)?.trim();
  if (loc && loc.length <= LOC_MAX) return { scope: { kind: "loc", loc }, fellBack: false };
  const def = areaBySlug(DEFAULT_AREA)!;
  return { scope: { kind: "area", slug: def.slug, name: def.name }, fellBack: Boolean(areaRaw || loc) };
}

export function scopeName(scope: Scope): string {
  return scope.kind === "area" ? scope.name : scope.loc;
}

export function loadInput(scope: Scope): { area?: string; loc?: string } {
  return scope.kind === "area" ? { area: scope.slug } : { loc: scope.loc };
}

function scopeEntry(scope: Scope): [string, string] {
  return scope.kind === "area" ? ["area", scope.slug] : ["loc", scope.loc];
}

function query(scope: Scope, f: Filters | null): string {
  return new URLSearchParams([scopeEntry(scope), ...(f ? filterEntries(f) : [])]).toString();
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
