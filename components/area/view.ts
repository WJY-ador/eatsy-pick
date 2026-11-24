// 상권 랭킹 화면의 지역 하나(기본 상권이든 직접 추가한 지역이든)를 같은 꼴로 만든다. 서버 전용.
// 직접 추가한 지역은 lib/place.ts 후보 검색으로 AreaPreset 꼴을 만들어 lib/report.ts를 그대로 쓴다.

import { type AreaPreset, AREAS, DEFAULT_RADIUS, areaBySlug } from "@/lib/areas";
import { latLngToTm, tmToLatLng } from "@/lib/geo";
import { presetFor } from "@/lib/home-params";
import { type AreaCandidate, type AreaKind, SIDO_SHORT, placeHref, presetHref, presetKey, unitOf } from "@/lib/my-areas";
import { type RegionPlace, rangesAround, searchRegionPlaces } from "@/lib/place";
import type { ReportOpts } from "@/lib/report";

type Point = { lat: number; lng: number };

export type AreaView = {
  area: AreaPreset;
  kind: AreaKind;
  key: string;
  /** 제목 이름(강남역, 해운대역, 대구 중구, 연동) */
  title: string;
  /** 경로 앞부분(/area/gangnam, /area/place) */
  base: string;
  /** 직접 추가 지역의 쿼리(?q=..&k=..). 기본 상권은 빈 문자열 */
  qs: string;
  /** 거리 기준점. 구, 동은 null(중심 반경을 쓰지 않는다) */
  center: Point | null;
  /** 거리 문구의 기준 이름(강남역). 구, 동은 null */
  centerName: string | null;
  /** 구, 동의 범위 문구(대구 중구 전체). 역과 기본 상권은 null */
  scopeName: string | null;
  /** 동명 지역을 가르는 주소(직접 추가 지역만) */
  address: string;
  opts: ReportOpts;
};

export function viewHref(v: Pick<AreaView, "base" | "qs">, group?: string): string {
  return `${v.base}${group ? `/${group}` : ""}${v.qs}`;
}

export function presetView(area: AreaPreset): AreaView {
  const ll = tmToLatLng(area.center.x, area.center.y);
  return {
    area,
    kind: "preset",
    key: presetKey(area.slug),
    title: area.name,
    base: presetHref(area.slug),
    qs: "",
    center: ll ? { lat: ll[0], lng: ll[1] } : null,
    centerName: area.centerName,
    scopeName: null,
    address: "",
    opts: {},
  };
}

/** 후보를 랭킹 조회 꼴로. 역은 둘레 음식점 주소로 범위를 넓힌다(카카오 1건) */
async function placeView(p: RegionPlace): Promise<AreaView> {
  const dongs = p.kind === "station" ? await rangesAround({ lat: p.lat, lng: p.lng }, p.range) : [p.range];
  const sigungu = [...new Set([p.sigungu, ...dongs.map((d) => d.split(/\s+/)[0])])].filter(Boolean);
  const anySigungu = p.sigungu === "";
  const area: AreaPreset = {
    slug: "place",
    name: p.name,
    centerName: p.name,
    aliases: [],
    dongs,
    sigungu: anySigungu ? [] : p.kind === "station" ? sigungu : [p.sigungu],
    center: latLngToTm(p.lat, p.lng),
    radius: DEFAULT_RADIUS,
  };
  const href = placeHref(p.q, p.key);
  const region = p.kind === "region";
  return {
    area,
    kind: p.kind,
    key: p.key,
    title: p.name,
    base: "/area/place",
    qs: href.slice("/area/place".length),
    center: region ? null : { lat: p.lat, lng: p.lng },
    centerName: region ? null : p.name,
    scopeName: region ? `${p.level === "dong" ? p.range : p.name} 전체` : null,
    address: p.address,
    // 결과에서 다른 시도의 가게를 뺀다(중구, 고성군처럼 이름이 겹치는 곳). 17개 시도 밖의 시도 이름이면 거르지 않는다.
    opts: { noRadius: region || undefined, sido: SIDO_SHORT.has(p.sido) ? p.sido : undefined, anySigungu: anySigungu || undefined },
  };
}

/** 주소의 q, k로 직접 추가 지역을 다시 푼다. 후보 검색이 실패하면 throw(오류 경계), 키가 없으면 null */
export async function resolvePlaceView(q: string, k: string): Promise<AreaView | null> {
  const places = await searchRegionPlaces(q);
  if (!places) throw new Error("place search failed");
  const p = places.find((x) => x.key === k);
  return p ? placeView(p) : null;
}

// ---------- 후보 ----------

/** 기본 상권 중심에서 이 거리 안의 같은 이름 역이면 기본 상권으로 본다(사본을 만들지 않는다) */
const PRESET_MATCH_M = 1500;

function presetCandidate(area: AreaPreset): AreaCandidate {
  return {
    key: presetKey(area.slug),
    kind: "preset",
    level: "preset",
    unit: unitOf("preset", area.name),
    name: area.name,
    sido: "",
    address: `${area.centerName} 중심, ${area.dongs.slice(0, 2).join(", ")}`,
    href: presetHref(area.slug),
    slug: area.slug,
  };
}

function metersBetween(a: Point, b: Point): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function presetForStation(p: RegionPlace): AreaPreset | null {
  const slug = presetFor(p.name);
  const area = slug ? areaBySlug(slug) : undefined;
  if (!area) return null;
  const ll = tmToLatLng(area.center.x, area.center.y);
  return ll && metersBetween({ lat: ll[0], lng: ll[1] }, p) <= PRESET_MATCH_M ? area : null;
}

export function toCandidate(p: RegionPlace): AreaCandidate {
  return { key: p.key, kind: p.kind, level: p.level, unit: p.unit, name: p.name, sido: p.sido, address: p.address, href: placeHref(p.q, p.key) };
}

/**
 * 지역 후보. 검색어가 기본 상권 이름이나 별칭이면 그 상권을 맨 앞에, 기본 상권 근처의 같은 이름 역도 그 상권으로 바꾼다.
 * 카카오 검색이 실패하고 기본 상권도 아니면 throw.
 */
export async function areaCandidates(query: string): Promise<AreaCandidate[]> {
  const out = new Map<string, AreaCandidate>();
  const slug = presetFor(query);
  const direct = slug ? AREAS.find((a) => a.slug === slug) : undefined;
  if (direct) out.set(presetKey(direct.slug), presetCandidate(direct));
  const places = await searchRegionPlaces(query);
  if (!places && out.size === 0) throw new Error("place search failed");
  for (const p of places ?? []) {
    const preset = p.kind === "station" ? presetForStation(p) : null;
    const c = preset ? presetCandidate(preset) : toCandidate(p);
    if (!out.has(c.key)) out.set(c.key, c);
  }
  return [...out.values()];
}
