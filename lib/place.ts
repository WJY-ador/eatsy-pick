// 역이나 장소 이름 → 잇플 조회용 주소 범위와 기준점. 카카오 로컬 키워드 검색을 서버에서만 부른다.
// 키는 KAKAO_REST_KEY(서버 전용, NEXT_PUBLIC_ 아님)다. 키가 없거나 호출이 실패하면 null을 돌려주고,
// 부르는 쪽은 입력 그대로 주소 조회로 넘어간다. 사용자 위치는 이 모듈에 들어오지 않는다(검색어만 보낸다).
// Next 전용 API를 import하지 않는다(일반 Node에서는 fetch의 next 옵션이 무시된다).

import type { PlaceHit } from "./home-data";
import { METRO, shortSido, unitOf } from "./my-areas";

const ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";
const CATEGORY_ENDPOINT = "https://dapi.kakao.com/v2/local/search/category.json";
const TIMEOUT_MS = 3000;
/** 장소 좌표와 주소는 거의 바뀌지 않는다. 7일 동안 재사용한다 */
export const PLACE_REVALIDATE_SECONDS = 604800;
/** 지하철역 분류 코드 */
const SUBWAY = "SW8";
/** 음식점 분류 코드 */
const RESTAURANT = "FD6";
/** 기준점 둘레에서 주변 동을 찾는 반경(m) */
const NEAR_RADIUS_M = 500;
/** 주소 범위 최대 수(잇플 조회 호출 수와 같다) */
export const MAX_RANGES = 3;

type KakaoDoc = { place_name?: string; category_group_code?: string; address_name?: string; x?: string; y?: string };

export type PlaceResolved = {
  hit: PlaceHit;
  /** 잇플 조회 location에 넣을 주소 범위(예: "해운대구 우동"). 기준점의 동이 맨 앞, 최대 MAX_RANGES개 */
  ranges: string[];
};

/**
 * 카카오 주소 → 전체 주소 범위(리 포함). 시도와 지번(산 번지 포함)을 뗀다.
 * "부산 해운대구 우동 656" → "해운대구 우동", "강원특별자치도 춘천시 근화동 1" → "춘천시 근화동".
 * 역과 장소 기준점의 조회에는 아래 addressRange를 쓴다.
 * 시도를 떼는 까닭: 가맹점 주소의 시도 표기가 섞여 있어(강원, 전라남도) 넣으면 0건이 된다(2026-11-23 춘천역 실측 0 → 72).
 */
export function addressRangeFull(addressName: string): string | null {
  const tokens = addressName.trim().split(/\s+/).filter(Boolean).slice(1);
  const cut = tokens.findIndex((t) => t === "산" || /^(산)?\d/.test(t));
  const kept = cut === -1 ? tokens : tokens.slice(0, cut);
  return kept.length >= 1 ? kept.join(" ") : null;
}

/**
 * 역과 장소 기준점의 잇플 조회 범위. addressRangeFull에서 읍이나 면 뒤의 리를 뗀다
 * ("경북 포항시 북구 흥해읍 이인리 137-1" → "포항시 북구 흥해읍"). 동 주소는 addressRangeFull과 같다.
 * 리를 떼는 까닭: 읍면 가맹점 주소는 대부분 도로명이라 리가 없다(2026-11-24 실측: 흥해읍 이인리 0건, 흥해읍 100건 중 리 표기 5건).
 * 지역 키와 사용자가 고른 리 지역(지역 추가의 리 후보)은 addressRangeFull을 그대로 쓴다.
 */
export function addressRange(addressName: string): string | null {
  const full = addressRangeFull(addressName);
  if (!full) return null;
  const tokens = full.split(" ");
  const n = tokens.length;
  if (n >= 2 && /리$/.test(tokens[n - 1]) && /[읍면]$/.test(tokens[n - 2])) return tokens.slice(0, -1).join(" ");
  return full;
}

/** 지하철역 이름에서 노선 표기를 뗀다("해운대역 부산2호선" → "해운대역") */
function placeName(doc: KakaoDoc): string {
  const name = (doc.place_name ?? "").trim();
  if (doc.category_group_code === SUBWAY) return name.split(/\s+/)[0] ?? name;
  return name;
}

/**
 * 키워드 검색 결과에서 기준점을 고른다. 지하철역을 먼저, 없으면 첫 결과.
 * stationOnly면 지하철역과 이름이 검색어와 같은 장소(분류 코드가 없는 기차역, 예: 전주역)만 받는다.
 */
export function pickPlace(docs: KakaoDoc[], query: string, stationOnly = false): { hit: PlaceHit; range: string; category: string } | null {
  const q = query.trim();
  const subway = docs.filter((d) => d.category_group_code === SUBWAY);
  const named = docs.filter((d) => d.category_group_code !== SUBWAY && (d.place_name ?? "").trim() === q);
  const ordered = stationOnly ? [...subway, ...named] : [...subway, ...docs.filter((d) => d.category_group_code !== SUBWAY)];
  for (const d of ordered) {
    const lat = Number(d.y);
    const lng = Number(d.x);
    const range = addressRange(d.address_name ?? "");
    if (!range || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;
    return { hit: { name: placeName(d), lat, lng, address: d.address_name ?? "" }, range, category: d.category_group_code ?? "" };
  }
  return null;
}

/**
 * 주소 범위 목록: 기준점의 동을 맨 앞에 두고, 기준점에서 가까운 음식점 주소에 두 번 이상 나온 동을 많은 순으로 더한다.
 * 역이 동 경계에 있으면 역의 동에는 가게가 거의 없을 수 있다(서울역 봉래동2가 1곳).
 */
export function rangesNear(first: string, nearDocs: KakaoDoc[]): string[] {
  const counts = new Map<string, number>();
  for (const d of nearDocs) {
    const r = addressRange(d.address_name ?? "");
    if (r && r !== first) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const more = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([r]) => r);
  return [first, ...more].slice(0, MAX_RANGES);
}

function keywordUrl(query: string): string {
  return `${ENDPOINT}?${new URLSearchParams({ query, size: "15" }).toString()}`;
}

async function kakao(url: string, key: string): Promise<KakaoDoc[] | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: PLACE_REVALIDATE_SECONDS },
    } as RequestInit);
    if (!res.ok) return null;
    const body = (await res.json()) as { documents?: unknown };
    return Array.isArray(body.documents) ? (body.documents as KakaoDoc[]) : null;
  } catch {
    return null;
  }
}

/**
 * 장소 이름으로 주소 범위와 기준점을 찾는다. 키가 없거나 실패, 결과 없음은 null.
 * stationOnly(역 이름 꼴 입력)면 역 결과만 받는다(같은 이름의 식당을 기준점으로 잡지 않게).
 * 주변 동 찾기가 실패하면 기준점의 동 하나만 쓴다.
 */
export async function findPlace(query: string, stationOnly = false): Promise<PlaceResolved | null> {
  const key = process.env.KAKAO_REST_KEY;
  const q = query.trim();
  if (!key || !q) return null;
  const docs = await kakao(keywordUrl(q), key);
  const picked = docs ? pickPlace(docs, q, stationOnly) : null;
  if (!picked) return null;
  const near = await kakao(
    `${CATEGORY_ENDPOINT}?${new URLSearchParams({
      category_group_code: RESTAURANT,
      x: String(picked.hit.lng),
      y: String(picked.hit.lat),
      radius: String(NEAR_RADIUS_M),
      sort: "distance",
      size: "15",
    }).toString()}`,
    key,
  );
  return { hit: picked.hit, ranges: rangesNear(picked.range, near ?? []) };
}

/** 맨 지명으로 받는 관광지, 명소 분류 코드(이태원거리, 해운대해수욕장) */
const ATTRACTION = "AT4";
/** 맨 지명 기준점으로 받지 않는 분류 코드(음식점, 카페). 이름이 같아도 가게를 지역으로 읽지 않는다 */
const SHOP = new Set(["FD6", "CE7"]);

/**
 * 맨 지명(이태원, 낙산공원)을 지역 조회용 loc로 바꿀 수 있는지 본다. 가게 이름 검색이 0곳일 때만 부른다.
 * 키워드 검색 1건이고, 이 낱말로 이어지는 지역 조회(findPlace)가 같은 주소를 다시 쓰므로 한 요청의 카카오 호출은 2건이다.
 * 받는 조건: 고른 기준점(findPlace와 같은 규칙)이 지하철역이나 명소이거나 이름이 낱말과 같고(분류 코드가 없는 공원),
 * 음식점이나 카페가 아니고, 이름이 그 낱말로 시작한다. 아니면 null(가게 이름 검색 결과 없음을 그대로 둔다). 키가 없거나 실패도 null.
 */
export async function regionForWord(word: string): Promise<string | null> {
  const key = process.env.KAKAO_REST_KEY;
  const w = word.trim();
  if (!key || !/^[가-힣]{2,10}$/.test(w)) return null;
  const asWord = await kakao(keywordUrl(w), key);
  const picked = asWord ? pickPlace(asWord, w, false) : null;
  if (!picked || SHOP.has(picked.category) || !picked.hit.name.startsWith(w)) return null;
  return picked.category === SUBWAY || picked.category === ATTRACTION || picked.hit.name === w ? w : null;
}

// ---------- 지역 후보(상권 랭킹의 지역 추가, 지역 변경) ----------
// 지역 추가 검색은 입력을 항상 지역으로 읽는다(가게 이름으로 읽지 않는다). 역은 지하철역(SW8)만,
// 구와 동은 카카오 주소 검색의 지역(REGION) 결과 중 법정동 코드가 있는 것만 받는다(잇플 주소는 법정동이다).

const ADDRESS_ENDPOINT = "https://dapi.kakao.com/v2/local/search/address.json";

type KakaoAddressDoc = {
  address_name?: string;
  address_type?: string;
  x?: string;
  y?: string;
  address?: { region_1depth_name?: string; region_2depth_name?: string; region_3depth_name?: string; b_code?: string } | null;
};

/** 지역 후보 하나(서버 전용 값 포함). 화면용 후보는 lib/my-areas.ts AreaCandidate */
export type RegionPlace = {
  key: string;
  kind: "station" | "region";
  level: "station" | "sido" | "gu" | "dong";
  /** 화면 꼬리표(역, 시, 도, 구, 군, 동, 읍, 면) */
  unit: string;
  name: string;
  /** 짧은 시도 이름 */
  sido: string;
  /** 카카오 주소(시도 포함) */
  address: string;
  lat: number;
  lng: number;
  /** 역: 역의 주소 범위(해운대구 우동). 구, 동: 잇플 조회 location(대구 중구, 제주시 연동) */
  range: string;
  /** 시군구(주소 둘째 토큰, 잇플 주소의 시군구 필터와 맞춘다). 빈 문자열이면 시군구로 거르지 않는다(세종) */
  sigungu: string;
  /** 같은 후보를 다시 찾는 검색어(주소에 싣는다) */
  q: string;
};

function coord(d: { x?: string; y?: string }): { lat: number; lng: number } | null {
  const lat = Number(d.y);
  const lng = Number(d.x);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null;
}

function regionOf(d: KakaoAddressDoc): RegionPlace | null {
  const a = d.address;
  const at = coord(d);
  if (d.address_type !== "REGION" || !a || !a.b_code || !a.region_1depth_name || !at) return null;
  const rawSido = a.region_1depth_name.trim();
  const sido = shortSido(rawSido);
  const gu = (a.region_2depth_name ?? "").trim();
  const dong = (a.region_3depth_name ?? "").trim();
  const address = (d.address_name ?? "").trim();
  const base = { kind: "region" as const, sido, address, ...at, q: address };
  if (dong) {
    // 시군구가 없는 시도(세종)의 동은 시도를 붙여 조회하고 시군구로 거르지 않는다(가맹점 주소 둘째 토큰이 도로명이다).
    // 사용자가 고른 리 지역은 리 그대로 조회한다(제목과 범위 문구가 그 리다).
    const range = gu ? addressRangeFull(address) : `${sido} ${dong}`;
    if (!range) return null;
    const key = gu ? `region:${sido} ${gu} ${dong}` : `region:${sido} ${dong}`;
    return { ...base, key, level: "dong", unit: unitOf("dong", dong), name: dong, range, sigungu: gu.split(/\s+/)[0] ?? "" };
  }
  if (gu) {
    // 구 이름이 겹치는 특별시, 광역시는 시도를 붙여 조회한다(2026-11-24 실측: 중구 100건 중 대구 14건, 대구 중구 100건 모두 대구).
    // 도 단위 시군은 붙이지 않는다(가맹점 주소의 도 표기가 섞여 있다). 동명 시군(고성군)은 결과를 시도로 거른다.
    const range = METRO.has(sido) ? `${sido} ${gu}` : gu;
    return { ...base, key: `region:${sido} ${gu}`, level: "gu", unit: unitOf("gu", gu), name: `${sido} ${gu}`, range, sigungu: gu.split(/\s+/)[0] };
  }
  // 시도 전체(세종처럼 시군구가 없는 시도). 시도 이름으로 조회하고 시도로 거른다.
  return { ...base, key: `region:${sido}`, level: "sido", unit: unitOf("sido", sido, rawSido), name: sido, range: sido, sigungu: "" };
}

/** 주소 둘째 토큰이 시군구인가(세종 주소는 바로 동이나 도로명이 온다) */
function hasSigungu(address: string): boolean {
  return /(시|군|구)$/.test(address.trim().split(/\s+/)[1] ?? "");
}

function stationOf(d: KakaoDoc, query: string): RegionPlace | null {
  const at = coord(d);
  const address = (d.address_name ?? "").trim();
  const range = addressRange(address);
  // 키는 리를 뗀 조회 범위가 아니라 전체 범위로 만든다(이미 저장된 키와 공유 주소의 k가 그대로 맞는다).
  const keyRange = addressRangeFull(address);
  if (!at || !range || !keyRange) return null;
  const isSubway = d.category_group_code === SUBWAY;
  // 분류 코드가 없는 기차역(전주역)은 이름이 검색어 마지막 낱말과 같을 때만 받는다.
  const last = query.trim().split(/\s+/).pop() ?? "";
  if (!isSubway && !((d.category_group_code ?? "") === "" && /역$/.test(last) && (d.place_name ?? "").trim() === last)) return null;
  const name = placeName(d);
  const sido = shortSido(address.split(/\s+/)[0] ?? "");
  return {
    key: `station:${sido} ${keyRange} ${name}`,
    kind: "station",
    level: "station",
    unit: "역",
    name,
    sido,
    address,
    ...at,
    range,
    sigungu: hasSigungu(address) ? range.split(/\s+/)[0] : "",
    q: `${sido} ${name}`,
  };
}

/**
 * 지역 후보 검색. 카카오 주소 검색(구, 동)과 키워드 검색(역) 2건을 부른다. 키가 없거나 둘 다 실패하면 null, 결과 없음은 빈 배열.
 * 같은 키는 하나로 합친다(같은 역의 노선별 결과). 순서: 역, 구, 동(카카오 순서 유지).
 */
export async function searchRegionPlaces(query: string): Promise<RegionPlace[] | null> {
  const key = process.env.KAKAO_REST_KEY;
  const q = query.replace(/\s+/g, " ").trim();
  if (!key || !q) return null;
  const [addr, kw] = await Promise.all([
    kakao(`${ADDRESS_ENDPOINT}?${new URLSearchParams({ query: q, size: "10" }).toString()}`, key) as Promise<KakaoAddressDoc[] | null>,
    kakao(keywordUrl(q), key),
  ]);
  if (!addr && !kw) return null;
  const out = new Map<string, RegionPlace>();
  for (const d of kw ?? []) {
    const p = stationOf(d, q);
    if (p && !out.has(p.key)) out.set(p.key, p);
  }
  for (const d of addr ?? []) {
    const p = regionOf(d);
    if (p && !out.has(p.key)) out.set(p.key, p);
  }
  return [...out.values()];
}

/** 기준점 둘레 음식점 주소로 주소 범위 목록을 만든다(findPlace와 같은 규칙, 기준점을 이미 고른 경우). 실패하면 기준점의 범위 하나 */
export async function rangesAround(at: { lat: number; lng: number }, first: string): Promise<string[]> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) return [first];
  const near = await kakao(
    `${CATEGORY_ENDPOINT}?${new URLSearchParams({
      category_group_code: RESTAURANT,
      x: String(at.lng),
      y: String(at.lat),
      radius: String(NEAR_RADIUS_M),
      sort: "distance",
      size: "15",
    }).toString()}`,
    key,
  );
  return rangesNear(first, near ?? []);
}
