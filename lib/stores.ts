// 홈, 상권 분석, 방문 기록이 같이 쓰는 매장 계약(Store, AreaDataset)과 상권 조회(loadArea).
// 이 모듈은 Next 전용 API를 import하지 않는다(Node 스크립트에서도 돈다). 클라이언트는 타입만 import한다.

import { type AreaPreset, areaBySlug } from "./areas";
import { type EatplItem, REVALIDATE_SECONDS, type SearchFn, type SearchParams, createSearch } from "./eatpl";
import { isFranchise, normalizeName } from "./franchise";
import { tmToLatLng } from "./geo";
import type { PlaceHit } from "./home-data";
import { isAddressLike, looksLikeStation } from "./home-params";
import { findPlace } from "./place";
import { fetchAll, isUnnamedMerchant, sigunguOf } from "./pool";

export type Store = {
  id: string; // merUrl의 마지막 경로 세그먼트. merUrl이 없으면 이름+주소 해시
  name: string; // merNm 원문
  category: string; // merTpbuzNm
  address: string; // merAddr
  sigungu: string; // 주소에서 뽑은 시군구 첫 토큰(예: 강남구, 성남시)
  merUrl: string | null; // 원문 그대로. https://로 시작하지 않으면 null
  ccgRank: number | null; // ccgSaleRnk 원본 수치(반올림 금지). 누락은 null
  allRank: number | null; // allSaleRnk 원본 수치
  local: boolean | null; // loclPrsnPpltYn (누락은 null)
  hoesik: boolean | null; // empyVsitYn
  foreign: boolean | null; // frnrVsitYn
  peakDay: string | null; // congestionDwk: 월~일
  peakTime: string | null; // congestionTizn: 오전, 점심, 오후, 저녁, 심야, 새벽
  customers: string[]; // rk01, rk02, rk03 순서. 값 꼴 "30대남성"
  customer1: string | null; // 원본 rk01만. 비었으면 null(rk02를 1위로 올리지 않는다). 옛 기기 스냅샷에는 없을 수 있다
  open: string | null; // srtTime "HHMM"
  close: string | null; // endTime "HHMM" (open보다 작으면 익일)
  holidays: string[]; // hldyDwk
  lat: number | null; // TM128(xaxsVal, yaxsVal) → WGS84. 좌표 없으면 null
  lng: number | null;
  franchise: boolean; // lib/franchise.ts 판정
};

export type AreaDataset = {
  scopeLabel: string; // 실제 조회 범위 표기(예: "역삼동, 서초동")
  title: string; // 예: "강남역", "성수동2가"
  queries: string[]; // 실제로 보낸 location 값들
  returned: number; // API가 돌려준 건수 합(중복 정리 전)
  hitLimit: boolean; // 어느 호출이든 100건이면 true
  failed: number; // 실패한 호출 수
  stores: Store[]; // 중복 정리 뒤, API 순서(시군구 매출 상위 순)
  center: { lat: number; lng: number } | null; // 프리셋 중심, 장소 검색이면 그 장소 좌표, 그 밖은 null
};

/** API 한 호출의 최대 반환 건수(spec 2절) */
export const API_LIMIT = 100;
/** 프리셋 상권 조회에 쓰는 동 수 상한 */
export const AREA_MAX_DONGS = 3;
/** 기본 상권(쿼리 없는 첫 진입) */
export const DEFAULT_AREA_SLUG = "gangnam";
/** 자유 입력 동네 이름 길이 상한 */
export const LOC_MAX = 30;

const search: SearchFn = createSearch(REVALIDATE_SECONDS);

// ---------- 정규화 ----------

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** FNV-1a 32비트, base36. merUrl이 없는 매장의 결정적 id */
function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `h${(h >>> 0).toString(36)}`;
}

/** merUrl 원문이 https://로 시작할 때만 남긴다. 값은 바꾸지 않는다. */
function merUrlOf(v: unknown): string | null {
  return typeof v === "string" && v.startsWith("https://") ? v : null;
}

function idFrom(merUrl: string | null, name: string, address: string): string {
  if (merUrl) {
    try {
      const seg = new URL(merUrl).pathname.split("/").filter(Boolean).pop();
      if (seg) return seg;
    } catch {
      // 아래 해시로 간다
    }
  }
  return hashId(`${normalizeName(name)}|${address.trim()}`);
}

export function toStore(it: EatplItem): Store {
  const name = it.merNm;
  const address = it.merAddr ?? "";
  const merUrl = merUrlOf(it.merUrl);
  const ll = tmToLatLng(it.xaxsVal, it.yaxsVal);
  const rk = it.vistCstmrRnkList ?? {};
  return {
    id: idFrom(merUrl, name, address),
    name,
    category: it.merTpbuzNm ?? "",
    address,
    sigungu: sigunguOf(address),
    merUrl,
    ccgRank: num(it.ccgSaleRnk),
    allRank: num(it.allSaleRnk),
    local: bool(it.loclPrsnPpltYn),
    hoesik: bool(it.empyVsitYn),
    foreign: bool(it.frnrVsitYn),
    peakDay: str(it.congestionDwk),
    peakTime: str(it.congestionTizn),
    customers: ["rk01", "rk02", "rk03"].map((k) => rk[k]).filter((v): v is string => typeof v === "string" && v !== ""),
    customer1: str(rk.rk01),
    open: str(it.srtTime),
    close: str(it.endTime),
    holidays: Array.isArray(it.hldyDwk) ? it.hldyDwk.filter((d): d is string => typeof d === "string") : [],
    lat: ll ? ll[0] : null,
    lng: ll ? ll[1] : null,
    franchise: isFranchise(name, it.merTpbuzNm),
  };
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

/** 순위 비교값. 누락은 맨 뒤로 보낸다(표시용 값은 바꾸지 않는다). */
function rankKey(s: Store): number {
  return s.ccgRank ?? Number.POSITIVE_INFINITY;
}

/**
 * 중복 정리: 이름 + 주소 앞부분이 같으면 하나로, 시군구 순위가 좋은 쪽을 남긴다.
 * id가 겹치는 경우(같은 merUrl)도 하나로 합친다. 결과는 시군구 매출 상위 순(누락은 뒤, 같은 값은 들어온 순서).
 */
export function dedupeStores(stores: Store[]): Store[] {
  const byKey = new Map<string, Store>();
  for (const s of stores) {
    const key = `${normalizeName(s.name)}|${addrKey(s.address)}`;
    const prev = byKey.get(key);
    if (!prev || rankKey(s) < rankKey(prev)) byKey.set(key, s);
  }
  const byId = new Map<string, Store>();
  for (const s of byKey.values()) {
    const prev = byId.get(s.id);
    if (!prev || rankKey(s) < rankKey(prev)) byId.set(s.id, s);
  }
  const order = new Map(stores.map((s, i) => [s, i]));
  return [...byId.values()].sort((a, b) => rankKey(a) - rankKey(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** 비실명 가맹점 제외 → Store 변환 → (프리셋이면) 허용 시군구 필터 → 중복 정리 */
export function normalizeItems(items: EatplItem[], allowedSigungu?: string[]): Store[] {
  let out = items.filter((it) => typeof it.merNm === "string" && !isUnnamedMerchant(it.merNm)).map(toStore);
  if (allowedSigungu && allowedSigungu.length > 0) {
    const allowed = new Set(allowedSigungu);
    out = out.filter((s) => allowed.has(s.sigungu));
  }
  return dedupeStores(out);
}

// ---------- 조회 ----------

export function presetCenter(area: AreaPreset): { lat: number; lng: number } | null {
  const ll = tmToLatLng(area.center.x, area.center.y);
  return ll ? { lat: ll[0], lng: ll[1] } : null;
}

/** 자유 입력 동네 이름 정리(공백 정리, 길이 제한). 비면 null */
export function cleanLoc(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.replace(/\s+/g, " ").trim();
  return v && v.length <= LOC_MAX ? v : null;
}

type Plan = { title: string; queries: string[]; sigungu?: string[]; center: { lat: number; lng: number } | null; place: PlaceHit | null };

/**
 * 조회 계획. 프리셋이면 그 동들, 주소 꼴(동, 구, 가, 시도 + 동)이면 입력 그대로,
 * 그 밖(역이나 장소 이름)은 장소 검색으로 찾은 주소 범위(최대 3건)와 그 좌표. 장소 검색이 안 되면 입력 그대로.
 */
async function planOf(input: { area?: string; loc?: string }): Promise<Plan> {
  const loc = cleanLoc(input.loc);
  const preset = areaBySlug(input.area);
  if (preset || !loc) {
    const a = preset ?? areaBySlug(DEFAULT_AREA_SLUG)!;
    return { title: a.name, queries: a.dongs.slice(0, AREA_MAX_DONGS), sigungu: a.sigungu, center: presetCenter(a), place: null };
  }
  const found = isAddressLike(loc) ? null : await findPlace(loc, looksLikeStation(loc));
  if (found) return { title: loc, queries: found.ranges, center: { lat: found.hit.lat, lng: found.hit.lng }, place: found.hit };
  return { title: loc, queries: [loc], center: null, place: null };
}

async function runQueries(queries: SearchParams[], fn: SearchFn) {
  const { items, calls, firstError } = await fetchAll(queries, fn);
  return { items, failed: calls.failed, firstError, perCall: calls.succeeded };
}

/**
 * 상권 조회. area(프리셋 slug)면 그 프리셋의 동 앞 3개를 location만으로 조회하고 허용 시군구로 거른다.
 * category(업종)를 주면 같은 location × 그 업종 1개로 조회한다(음식 검색).
 * name(가게 이름)을 주면 같은 location × 그 이름(merNm)으로 조회한다(상권 분석의 범위 안 이름 검색).
 * 지역 조회를 받아 이름으로 거르지 않는 까닭: 지역 조회는 범위마다 상위 100곳이라 이름이 맞는 매장이 많이 빠진다
 * (2026-11-24 실측, 강남역 투썸 22곳 중 8곳, 메가 48곳 중 11곳만 남았다). 호출 수는 지역 조회와 같다.
 * loc(자유 입력)이면 주소 꼴은 그 값 1건, 역이나 장소 이름은 장소 검색으로 찾은 주소 범위(최대 3건).
 * 0건이면 빈 dataset, 호출이 전부 실패하면 throw. 응답은 Next fetch 캐시가 21600초 동안 재사용한다.
 * place는 장소 검색으로 찾은 기준점(없으면 null).
 */
export async function loadAreaWithPlace(
  input: { area?: string; loc?: string; category?: string; name?: string },
  fn: SearchFn = search,
): Promise<{ dataset: AreaDataset; place: PlaceHit | null }> {
  const plan = await planOf(input);
  // category나 name이 있으면 같은 location마다 그 조건을 붙여 조회한다(호출 수는 그대로 3건 이하).
  const params: SearchParams[] = plan.queries.map((location) => ({
    location,
    ...(input.category ? { merTpbuzNm: input.category } : {}),
    ...(input.name ? { merNm: input.name } : {}),
  }));
  const settled = await Promise.allSettled(params.map((p) => fn(p)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<EatplItem[]> => s.status === "fulfilled");
  const failed = settled.length - ok.length;
  if (ok.length === 0) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw first?.reason instanceof Error ? first.reason : new Error("area lookup failed");
  }
  const items = ok.flatMap((s) => s.value);
  return {
    dataset: {
      scopeLabel: plan.queries.join(", "),
      title: plan.title,
      queries: plan.queries,
      returned: items.length,
      hitLimit: ok.some((s) => s.value.length >= API_LIMIT),
      failed,
      stores: normalizeItems(items, plan.sigungu),
      center: plan.center,
    },
    place: plan.place,
  };
}

/** 상권 조회(기준점 없이 dataset만). 상권 분석과 공유 카드가 쓴다 */
export async function loadArea(input: { area?: string; loc?: string; category?: string; name?: string }, fn: SearchFn = search): Promise<AreaDataset> {
  return (await loadAreaWithPlace(input, fn)).dataset;
}

// ---------- 매장 검색(홈) ----------

export type StoreSearch = {
  query: string;
  /** 실제로 보낸 조회 */
  calls: SearchParams[];
  failed: number;
  stores: Store[];
};

/**
 * 매장 이름 검색. merNm 1건, 토큰이 둘 이상이면 location(첫 토큰) + merNm(나머지) 1건을 더한다(합쳐 2건 이하).
 * 전부 실패하면 throw. 0건은 빈 배열.
 */
export async function searchStores(q: string, fn: SearchFn = search): Promise<StoreSearch> {
  const query = q.replace(/\s+/g, " ").trim().slice(0, 40);
  const tokens = query.split(" ").filter(Boolean);
  const calls: SearchParams[] = [{ merNm: query }];
  if (tokens.length >= 2) calls.push({ location: tokens[0], merNm: tokens.slice(1).join(" ") });
  const { items, failed, firstError, perCall } = await runQueries(calls, fn);
  if (perCall === 0) throw firstError instanceof Error ? firstError : new Error("store search failed");
  return { query, calls, failed, stores: normalizeItems(items) };
}
