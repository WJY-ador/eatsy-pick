// 홈 URL 계약. 서버 page와 클라이언트가 같이 쓴다. Next 전용 API와 proj4를 import하지 않는다.
//   area=<slug> | loc=<동네, 구, 역, 프리셋 이름>(+ near=1) | q=<통합 검색어>&id=<Store.id> | fr=0
//   loc + q(id 없음)는 지역 홈 + 그 이름이 들어간 가게다(맨 낱말 검색이 지역으로 풀리면 서버가 이 꼴로 보낸다).
//   범위 없는 q는 가게 이름 검색만이다.
//   | t=<테마 top1|local|hoesik, 칩에서 뺀 y2030은 옛 링크용으로 계속 읽는다> | s=rank
//   옛 링크의 occ, n, d(거리 구간)는 읽지 않는다.

import { AREAS, areaBySlug, normalizePlace } from "./areas";
import { foodCategory } from "./food";
import { type ThemeId, isThemeId } from "./themes";

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
  /** 테마 칩(주소 t, 없으면 "all") */
  theme: ThemeId;
  /** 전체 매장 목록 정렬(주소 s=rank면 "rank", 없으면 "near") */
  sort: "near" | "rank";
};

export type HomeSort = HomeQuery["sort"];

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

// 주소 단위로 끝나는 토큰(부산 해운대구 우동, 성수동2가, 세종로). 숫자 지번도 주소로 본다.
// 두 글자 낱말(메가, 우리)은 주소로 읽지 않는다. 한 글자 + 구, 군, 동(중구, 다동)과 숫자 + 가(을지로3가)는 받는다.
const ADDRESS_TOKEN = /^(?:[가-힣]{2,}\d*(?:시|도|구|군|동|읍|면|리|로|길)|[가-힣](?:구|군|동)|[가-힣]+\d+가|\d[\d-]*)$/;
const METRO = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);

/**
 * 주소 조회에 그대로 넣어도 되는 지역 표현인가(모든 토큰이 시도 이름이거나 주소 단위로 끝난다).
 * 아니면(해운대역, 해운대) 서버가 장소 검색으로 주소 범위를 찾는다.
 */
export function isAddressLike(input: string): boolean {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => METRO.has(t) || ADDRESS_TOKEN.test(t));
}

/** 역 이름 꼴(해운대역, 서울역). 프리셋 판정 뒤에 쓴다 */
export function looksLikeStation(input: string): boolean {
  const v = input.trim();
  // 미역으로 끝나는 상호(보돌미역)는 역으로 읽지 않는다.
  return /^[가-힣A-Za-z0-9]{1,12}역$/.test(v) && !/미역$/.test(v);
}

/** 지역 표현인가(프리셋, 동네 꼴, 역 이름 꼴, 주소 꼴). 상호 + 음식(교촌 치킨)과 지역 + 음식을 가른다 */
export function isRegionTerm(input: string): boolean {
  return presetFor(input) !== null || looksLikePlace(input) || looksLikeStation(input) || isAddressLike(input);
}

/**
 * 검색어를 지역 부분과 음식 부분으로 나눈다("해운대역 고기" → 해운대역 + 고기구이).
 * 음식 표현인 토큰이 정확히 하나이고 나머지가 지역 표현(isRegionTerm)일 때만 나눈다.
 * 아니면 null(교촌 치킨, 원조 할매 국밥은 매장 이름 검색으로 간다. 맨 지명 + 음식인 해운대 고기도 여기 든다).
 */
export function splitRegionFood(input: string): { region: string; food: string; foodTerm: string } | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const hits = tokens.map((t, i) => ({ t, i, cat: foodCategory(t) })).filter((x) => x.cat);
  if (hits.length !== 1) return null;
  const { t, i, cat } = hits[0];
  const region = tokens.filter((_, j) => j !== i).join(" ");
  return isRegionTerm(region) ? { region, food: cat as string, foodTerm: t } : null;
}

/** 맨 낱말 꼴: 공백 없는 한글 2~10자(다산, 망원). 서버가 카카오로 지역인지 본다(lib/word-region.ts) */
export const BARE_WORD = /^[가-힣]{2,10}$/;

/**
 * 맛집 둘러보기 검색의 맨 낱말 부분. 맨 낱말(망원)이면 그 낱말, 맨 낱말 + 음식 표현 하나(망원 고기)면 낱말과 업종.
 * 그 밖은 null. 지역 꼴과 음식만인 검색어는 parseHome이 먼저 푼다.
 */
export function bareWordFood(input: string): { word: string; food: string | null } | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return BARE_WORD.test(tokens[0]) ? { word: tokens[0], food: null } : null;
  if (tokens.length !== 2) return null;
  const cats = tokens.map((t) => foodCategory(t));
  const i = cats.findIndex(Boolean);
  if (i < 0 || cats[1 - i]) return null;
  const word = tokens[1 - i];
  return BARE_WORD.test(word) ? { word, food: cats[i] } : null;
}

function areaScope(slug: string): HomeScope {
  const a = areaBySlug(slug) ?? areaBySlug(DEFAULT_SLUG)!;
  return { kind: "area", slug: a.slug, name: a.name };
}

/**
 * 직접 입력한 지역을 범위로 바꾼다. 프리셋 이름이나 별칭(강남역, 성수)이면 그 상권,
 * 아니면 동네 범위(API가 주소 부분일치라 구, 동, 가 모두 된다. 역이나 장소 이름은 서버가 장소 검색으로 주소 범위를 찾는다).
 * 행정동 꼴(역삼1동)은 API 주소의 법정동 꼴(역삼동)로 맞춘다. 비었거나 너무 길면 null.
 */
export function scopeFromPlace(input: string | null | undefined): HomeScope | null {
  const v = clean(input ?? undefined, LOC_MAX);
  if (!v) return null;
  const preset = presetFor(v);
  if (preset) return areaScope(preset);
  return { kind: "loc", loc: v.replace(/^(.+?)\d+동$/, "$1동") };
}

export function parseHome(raw: Raw): HomeQuery {
  const area = areaBySlug(clean(first(raw.area), 40));
  let q = clean(first(raw.q), Q_MAX);
  // loc가 프리셋 이름이면 그 상권으로 읽는다(탐색 폼을 스크립트 없이 보내도 같은 결과).
  let scope: HomeScope | null = area ? areaScope(area.slug) : scopeFromPlace(first(raw.loc));
  const id = clean(first(raw.id), 80);
  // 통합 검색어 해석(스크립트 없이 폼을 보내도 같은 결과). 순서: 프리셋 → 동네(동, 구, 가) → 역 이름 → 음식
  // → 지역 + 음식("해운대역 고기") → 주소 여러 토큰("해운대구 우동") → 그 밖은 매장 이름 검색.
  // id가 있으면 q는 매장 이름이다(상권 분석에서 온 영수증 링크).
  let food: string | null = null;
  let foodTerm: string | null = null;
  if (q && !id) {
    const preset = presetFor(q);
    const split = preset ? null : splitRegionFood(q);
    if (preset) {
      scope = areaScope(preset);
      q = null;
    } else if (looksLikePlace(q) || looksLikeStation(q)) {
      scope = scopeFromPlace(q);
      q = null;
    } else if (foodCategory(q)) {
      food = foodCategory(q);
      foodTerm = q;
      q = null;
    } else if (split) {
      scope = scopeFromPlace(split.region) ?? scope;
      food = split.food;
      foodTerm = split.foodTerm;
      q = null;
    } else if (/\s/.test(q) && isAddressLike(q) && scopeFromPlace(q)) {
      scope = scopeFromPlace(q);
      q = null;
    }
  }
  // 옛 공유 링크(area=gangnam&q=가게 이름, 예전 canonical이 기본 상권을 붙였다)는 이름 검색으로 읽는다.
  // 기본 상권 피드를 이름 검색 아래에 다시 붙이지 않게 한다. 영수증 링크(id)와 loc는 그대로 둔다.
  if (q && !id && !food && first(raw.area) === DEFAULT_SLUG && !first(raw.loc)) scope = null;
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
    theme: isThemeId(first(raw.t)) ? (first(raw.t) as ThemeId) : "all",
    sort: first(raw.s) === "rank" ? "rank" : "near",
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
  o: {
    near?: boolean;
    q?: string | null;
    id?: string | null;
    excludeFranchise?: boolean;
    theme?: ThemeId;
    sort?: HomeSort;
  } = {},
): string {
  const e: [string, string][] = scopeEntries(scope);
  if (o.near) e.push(["near", "1"]);
  if (o.q) e.push(["q", o.q]);
  if (o.id) e.push(["id", o.id]);
  if (o.excludeFranchise === false) e.push(["fr", "0"]);
  if (o.theme && o.theme !== "all") e.push(["t", o.theme]);
  if (o.sort === "rank") e.push(["s", "rank"]);
  return `/?${new URLSearchParams(e).toString()}`;
}

/**
 * 상권 분석으로 현재 범위를 넘기는 경로. 음식 조건(업종)이 있으면 food로 넘겨 같은 업종 조회 범위를 보게 하고,
 * 프랜차이즈를 포함해 보고 있으면 fr=0을 넘긴다(기본값인 제외는 붙이지 않는다).
 */
export function analysisHref(scope: HomeScope, food: string | null = null, excludeFranchise = true): string {
  const e = scopeEntries(scope);
  if (food) e.push(["food", food]);
  if (!excludeFranchise) e.push(["fr", "0"]);
  return `/analysis?${new URLSearchParams(e).toString()}`;
}

export function scopeName(scope: HomeScope): string {
  return scope.kind === "area" ? scope.name : scope.loc;
}
