// 역지오코딩 제공자(교체 가능). 브라우저에서만 부른다.
// 2026-11-23 사용자 결정: 공개 Nominatim을 기본 제공자로 쓴다. 정책 네 조항(LLM 조항, 전환 가능, 프록시 권고,
// 개인정보)을 원문으로 확인한 뒤 사용자가 직접 정했다. 정책: https://operations.osmfoundation.org/policies/nominatim/
// 지키는 조건:
//   - 좌표는 소수 3자리(약 100m)로 줄여 보낸다. 정밀 좌표는 기기 밖으로 나가지 않는다.
//   - 같은 줄인 좌표는 세션 동안 다시 부르지 않는다(sessionStorage 캐시).
//   - 사용자 행동 또는 진입 1회당 1요청. 자동완성 용도로 쓰지 않는다. accept-language=ko.
//   - 화면에 출처를 표기한다(GEOCODE_CREDIT). fetch에 referrerPolicy를 걸지 않는다(Referer로 앱을 식별).
//   - 전환: NEXT_PUBLIC_GEOCODER=preset이면 프리셋 제공자만 쓴다(환경변수 하나와 재배포).
//   - Nominatim이 실패, 시간 초과, 빈 응답이면 프리셋 제공자로 넘어간다. 그것도 2km 밖이면 실패로 본다.

export type Place = {
  /** API location에 넣을 법정동 꼴(예: 성수동2가). 모르면 null */
  dong: string | null;
  /** 시군구(예: 성동구). 0건일 때 다시 조회하는 값 */
  gu: string | null;
  /** 프리셋 제공자가 고른 상권 slug */
  presetSlug?: string;
  source: string;
};

export interface Geocoder {
  readonly name: string;
  /** 출처 표기 문구. 없으면 표기하지 않는다 */
  readonly attribution?: string;
  reverse(lat: number, lng: number): Promise<Place | null>;
}

export type PresetPoint = { slug: string; name: string; lat: number; lng: number; gu: string; dong: string };

/** 소수 3자리(약 100m)로 줄인다 */
export function coarse(v: number): string {
  return v.toFixed(3);
}

/** Nominatim 동(행정동) → API 법정동 꼴. "역삼1동" → "역삼동", "성수2가3동" → "성수동2가" */
export function legalDong(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const ga = s.match(/^(.+?)(\d+)가\d*동$/);
  if (ga) return `${ga[1]}동${ga[2]}가`;
  const num = s.match(/^(.+?)\d+동$/);
  if (num) return `${num[1]}동`;
  return /(동|가)$/.test(s) ? s : null;
}

/** 프리셋 제공자가 받아 주는 최대 거리(m). 더 멀면 내 주변이라고 부를 수 없어 실패로 본다 */
export const PRESET_MAX_M = 2000;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 대체 제공자: 프리셋 상권 중 가장 가까운 중심. 외부 호출 없음 */
export function presetGeocoder(presets: PresetPoint[]): Geocoder {
  return {
    name: "preset",
    async reverse(lat, lng) {
      let best: PresetPoint | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const p of presets) {
        const d = haversine(lat, lng, p.lat, p.lng);
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
      if (!best || bestD > PRESET_MAX_M) return null;
      return { dong: best.dong, gu: best.gu, presetSlug: best.slug, source: "preset" };
    },
  };
}

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const CACHE_PREFIX = "eatsy:geo:";

function cacheGet(key: string): Place | null | undefined {
  try {
    const v = sessionStorage.getItem(CACHE_PREFIX + key);
    return v === null ? undefined : (JSON.parse(v) as Place | null);
  } catch {
    return undefined;
  }
}

function cacheSet(key: string, place: Place | null) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(place));
  } catch {
    // 저장소를 못 쓰면 캐시 없이 간다
  }
}

/** 공개 Nominatim reverse. 줄인 좌표가 같으면 세션 동안 다시 부르지 않는다 */
export const nominatimGeocoder: Geocoder = {
  name: "nominatim",
  attribution: "주소 변환: OpenStreetMap Nominatim",
  async reverse(lat, lng) {
    const la = coarse(lat);
    const lo = coarse(lng);
    const key = `${la},${lo}`;
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;
    const qs = new URLSearchParams({ format: "jsonv2", lat: la, lon: lo, zoom: "16", addressdetails: "1", "accept-language": "ko" });
    const res = await fetch(`${NOMINATIM_REVERSE}?${qs.toString()}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const body = (await res.json()) as { address?: Record<string, string> };
    const a = body.address ?? {};
    const dong = legalDong(a.quarter ?? a.suburb ?? a.neighbourhood ?? a.village);
    const gu = a.borough ?? a.city_district ?? a.county ?? null;
    const place: Place | null = dong || gu ? { dong, gu, source: "nominatim" } : null;
    cacheSet(key, place);
    return place;
  },
};

/** Nominatim 사용 스위치. 기본 켬, NEXT_PUBLIC_GEOCODER=preset이면 끈다 */
export const NOMINATIM_ON = process.env.NEXT_PUBLIC_GEOCODER !== "preset";
/** 화면 출처 표기(Nominatim이 켜져 있을 때) */
export const GEOCODE_CREDIT = "주소 변환: OpenStreetMap Nominatim";

/** 제공자 순서대로 시도한다. 앞이 실패하거나 null이면 다음으로 */
export async function reverseGeocode(lat: number, lng: number, chain: Geocoder[]): Promise<Place | null> {
  for (const g of chain) {
    try {
      const p = await g.reverse(lat, lng);
      if (p) return p;
    } catch {
      // 다음 제공자
    }
  }
  return null;
}
