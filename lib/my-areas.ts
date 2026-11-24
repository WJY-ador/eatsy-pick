// 내 상권 목록(/area). 기본 상권(AREAS)에서 뺀 것과 직접 추가한 지역을 이 기기의 localStorage에만 둔다.
// 지역 동일성 키는 입력한 이름이 아니라 풀린 범위다: 기본 상권 preset:<slug>, 역 station:<시도> <주소 범위> <역 이름>,
// 구와 동 region:<시도> <시군구>[ <동>]. 역 이름을 키에 넣는 까닭: 강남역과 역삼역은 둘 다 강남구 역삼동이다.
// 이 모듈은 클라이언트와 서버가 같이 쓴다. Next 전용 API, React, process.env를 쓰지 않는다. 저장소 훅은 components/area/my-areas-store.ts.

import { AREAS } from "./areas";

export const MY_AREAS_KEY = "eatsy.myAreas.v1";
/** 지역 검색 입력 길이 상한(서버 경로도 같은 값으로 자른다) */
export const AREA_QUERY_MAX = 30;
/** 직접 추가 지역 수 상한 */
export const CUSTOM_MAX = 40;

export type AreaKind = "preset" | "station" | "region";
/** 후보 단위. sido: 시군구가 없는 시도 전체(세종), gu: 시군구, dong: 읍면동 */
export type AreaLevel = "preset" | "station" | "sido" | "gu" | "dong";

/** 지역 검색 후보(서버 경로 /api/area-search 응답 한 줄) */
export type AreaCandidate = {
  key: string;
  kind: AreaKind;
  level: AreaLevel;
  /** 화면 꼬리표(역, 시, 도, 구, 군, 동, 읍, 면, 기본 상권). 주소의 실제 행정 단위 */
  unit?: string;
  /** 목록 이름(해운대역, 대구 중구, 연동, 강남역) */
  name: string;
  /** 짧은 시도 이름(부산, 제주). 기본 상권은 빈 문자열 */
  sido: string;
  /** 동명 지역을 가르는 주소(카카오 주소, 시도 포함) */
  address: string;
  /** 랭킹 주소 */
  href: string;
  /** 기본 상권이면 slug */
  slug?: string;
};

export type CustomArea = Omit<AreaCandidate, "kind" | "slug"> & { kind: "station" | "region" };

export type MyAreasState = { removed: string[]; custom: CustomArea[] };

export type MyAreaItem = { key: string; kind: "preset" | "custom"; name: string; sub: string; href: string };

export const LEVEL_LABEL: Record<AreaLevel, string> = { preset: "기본 상권", station: "역", sido: "시도", gu: "시군구", dong: "동" };

/** 행정 구역 이름의 끝 글자로 단위를 정한다(춘천시 시, 고성군 군, 중구 구, 연동면 면, 성수동1가 동) */
export function unitOf(level: AreaLevel, name: string, rawSido = ""): string {
  if (level === "preset") return LEVEL_LABEL.preset;
  if (level === "station") return "역";
  if (level === "sido") return /도$/.test(rawSido.trim()) ? "도" : "시";
  const last = name.trim().split(/\s+/).pop() ?? "";
  if (level === "gu") return /군$/.test(last) ? "군" : /시$/.test(last) ? "시" : "구";
  return /읍$/.test(last) ? "읍" : /면$/.test(last) ? "면" : /리$/.test(last) ? "리" : "동";
}

export function presetKey(slug: string): string {
  return `preset:${slug}`;
}

export function presetHref(slug: string): string {
  return `/area/${slug}`;
}

/** 직접 추가 지역의 랭킹 주소. q는 서버가 같은 후보를 다시 찾는 검색어, k는 그중 고를 키다 */
export function placeHref(q: string, k: string, group?: string): string {
  return `/area/place${group ? `/${group}` : ""}?${new URLSearchParams({ q, k }).toString()}`;
}

/** 같은 지역을 업종 페이지로(group 있음) 또는 상권 페이지로 */
export function areaHrefFor(href: string, group?: string | null): string {
  if (!group) return href;
  const [path, qs] = href.split("?");
  return `${path}/${group}${qs ? `?${qs}` : ""}`;
}

// ---------- 시도 ----------

const SIDO_LONG: Record<string, string> = {
  경기도: "경기",
  강원도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
};

/** 시도 표기를 짧게(서울특별시 → 서울, 대구광역시 → 대구, 제주특별자치도 → 제주, 경상남도 → 경남) */
export function shortSido(raw: string): string {
  const v = raw.trim();
  return SIDO_LONG[v] ?? v.replace(/(특별자치시|특별자치도|특별시|광역시)$/, "");
}

/** 구 이름이 겹치는 특별시, 광역시(중구, 동구, 서구, 남구, 북구, 강서구). 시군구 조회에 시도를 붙인다 */
export const METRO = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]);

/** 17개 시도 짧은 이름. 결과 시도 거르기에서 이 목록에 있는 다른 시도만 뺀다(낯선 표기는 남긴다) */
export const SIDO_SHORT = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);

/**
 * 가맹점 주소가 그 시도 안인가. 첫 토큰을 짧게 맞춰 비교한다(대구광역시, 강원특별자치도, 전라남도 표기가 섞여 있다).
 * 첫 토큰이 17개 시도에 없는 낯선 표기면 남긴다(지우면 그 지역 결과가 통째로 빠질 수 있다).
 */
export function inSido(merAddr: string | undefined, sido: string): boolean {
  const s = shortSido(merAddr?.trim().split(/\s+/)[0] ?? "");
  return s === sido || !SIDO_SHORT.has(s);
}

// ---------- 저장 ----------

export const DEFAULT_STATE: MyAreasState = { removed: [], custom: [] };

function isStr(v: unknown, max = 200): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

function cleanCustom(v: unknown): CustomArea | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.key) || !isStr(o.name, 60) || !isStr(o.href, 400) || typeof o.sido !== "string" || typeof o.address !== "string") return null;
  if (o.kind !== "station" && o.kind !== "region") return null;
  if (!o.href.startsWith("/area/place?")) return null;
  const level = o.level === "station" || o.level === "sido" || o.level === "gu" || o.level === "dong" ? o.level : o.kind === "station" ? "station" : "dong";
  return { key: o.key, kind: o.kind, level, name: o.name, sido: o.sido, address: o.address, href: o.href };
}

/** 저장 값 읽기. 깨졌거나 꼴이 다르면 기본 목록(빈 상태) */
export function parseMyAreas(raw: string | null): MyAreasState {
  if (!raw) return DEFAULT_STATE;
  try {
    const o = JSON.parse(raw) as { v?: unknown; removed?: unknown; custom?: unknown };
    if (!o || typeof o !== "object" || o.v !== 1) return DEFAULT_STATE;
    const presetKeys = new Set(AREAS.map((a) => presetKey(a.slug)));
    const removed = Array.isArray(o.removed) ? [...new Set(o.removed.filter((k): k is string => typeof k === "string" && presetKeys.has(k)))] : [];
    const seen = new Set<string>();
    const custom: CustomArea[] = [];
    for (const c of Array.isArray(o.custom) ? o.custom : []) {
      const x = cleanCustom(c);
      if (x && !seen.has(x.key) && !presetKeys.has(x.key)) {
        seen.add(x.key);
        custom.push(x);
      }
    }
    return { removed, custom: custom.slice(0, CUSTOM_MAX) };
  } catch {
    return DEFAULT_STATE;
  }
}

/** 화면 목록: 남은 기본 상권(원래 순서) 다음에 추가한 지역(추가한 순서) */
export function itemsOf(state: MyAreasState): MyAreaItem[] {
  const removed = new Set(state.removed);
  const presets: MyAreaItem[] = AREAS.filter((a) => !removed.has(presetKey(a.slug))).map((a) => ({
    key: presetKey(a.slug),
    kind: "preset",
    name: a.name,
    sub: "",
    href: presetHref(a.slug),
  }));
  const custom: MyAreaItem[] = state.custom.map((c) => ({ key: c.key, kind: "custom", name: c.name, sub: subOf(c), href: c.href }));
  return [...presets, ...custom];
}

/** 동명 지역을 가르는 짧은 주소(부산 해운대구, 제주 제주시) */
export function subOf(c: Pick<AreaCandidate, "address" | "sido" | "level">): string {
  // 시군구와 시도 전체는 이름에 이미 시도가 있다(대구 중구, 세종)
  if (c.level === "gu" || c.level === "sido") return "";
  const tokens = c.address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return c.sido;
  return [c.sido || tokens[0], ...tokens.slice(1, 2)].join(" ");
}

export function keysOf(state: MyAreasState): Set<string> {
  return new Set(itemsOf(state).map((i) => i.key));
}
