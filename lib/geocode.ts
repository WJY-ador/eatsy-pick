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
// 2026-11-24 사용자 결정: 순서를 카카오 1순위, Nominatim 2순위, 프리셋 3순위로 바꾼다.
// 까닭: 카카오는 법정동(B)과 행정동(H)을 직접 준다. Nominatim은 행정동만 줘서 법정동 꼴로 바꿔야 했다(legalDong).
// 카카오는 지도 JS SDK의 services.Geocoder.coord2RegionCode를 브라우저에서 직접 부른다(다른 지도 서비스와 같은 방식,
// 위치 허락 팝업이 동의 역할). 우리 서버를 거치지 않는다. 키는 지도와 같은 NEXT_PUBLIC_KAKAO_MAP_KEY.
// 순서 목록은 geocoderChain 하나에서 만든다. 홈 내 위치 버튼과 홈 지도의 현 지도에서 검색이 같은 목록을 쓴다.
// 위 조건을 카카오에도 그대로 적용한다:
//   - 좌표는 소수 3자리로 줄여 보낸다.
//   - 같은 줄인 좌표는 세션 동안 다시 부르지 않는다(sessionStorage, 제공자별 키). 결과 없음(바다)은 캐시하고, 실패는 캐시하지 않는다.
//   - 사용자 행동 또는 진입 1회당 1요청. 카카오가 실패, 시간 초과, 결과 없음이면 Nominatim으로 넘어간다.
//   - SDK가 없는 환경(키 없는 빌드, 등록 안 된 도메인이나 포트, SDK 로드 실패)에서는 카카오를 건너뛴다.
//   - 출처 표기 GEOCODE_CREDIT은 이 빌드가 쓸 수 있는 외부 제공자를 적는다. 푸터는 요청마다 쓰인 제공자를 모른다.
//   - NEXT_PUBLIC_GEOCODER=preset이면 외부 제공자 둘 다 끄고 프리셋만 쓴다.

import { KAKAO_MAP_KEY } from "./map-provider";

export type Place = {
  /** API location에 넣을 법정동 꼴. 구를 붙인다(성동구 성수동2가, 평창군 대관령면). 구를 모르면 동만. 모르면 null */
  dong: string | null;
  /** 시군구(예: 성동구). 0건일 때 다시 조회하는 값 */
  gu: string | null;
  /** 프리셋 제공자가 고른 상권 slug */
  presetSlug?: string;
  /** 시도(카카오 region_1depth_name, 예: 서울특별시). 카카오 결과에만 있다. 현 지도에서 검색이 검색 단위를 고를 때 쓴다 */
  sido?: string | null;
  /** 동, 읍면(카카오 region_3depth_name, 예: 역삼동, 대관령면). 카카오 결과에만 있다 */
  emd?: string | null;
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
    const gu = a.borough ?? a.city_district ?? a.county ?? null;
    // 카카오와 같은 구 + 동 꼴(2026-11-24 결정). 구 이름이 두 낱말이면 마지막 낱말만 붙인다
    const bare = legalDong(a.quarter ?? a.suburb ?? a.neighbourhood ?? a.village);
    const dong = bare && gu ? `${gu.trim().split(/\s+/).pop()} ${bare}` : bare;
    const place: Place | null = dong || gu ? { dong, gu, source: "nominatim" } : null;
    cacheSet(key, place);
    return place;
  },
};

/** coord2RegionCode 결과 한 줄에서 쓰는 부분 */
type KakaoRegion = { region_type?: string; region_1depth_name?: string; region_2depth_name?: string; region_3depth_name?: string };

/**
 * coord2RegionCode 결과 → Place. 법정동(B)만 쓴다. 동은 region_3depth_name(성수동2가, 을지로3가),
 * 시군구는 region_2depth_name(성동구, 수원시 영통구). 동 앞에는 2depth의 마지막 낱말을 붙인다(성동구 성수동2가, 분당구 백현동).
 * 리 지역은 3depth가 읍면, 4depth가 리다. 리를 떼고 읍면 앞에 2depth 전체를 붙여 역 범위 규칙(lib/place.ts addressRange)과
 * 같은 꼴로 만든다(평창군 대관령면 횡계리 → 평창군 대관령면). 영수증의 dongLocOf(lib/store-view.ts)와 같은 꼴이다.
 * 시도(1depth)와 동, 읍면(3depth)도 따로 담는다(현 지도에서 검색의 검색 단위 판정, lib/area-search.ts).
 * 붙이는 까닭: 동, 읍면 이름은 여러 시군구에 있다(2026-11-24 실측: loc=남면 89곳 모두 양주시 남면, 다동 100건 중 서울 중구 30건,
 * 구를 붙이면 98%). 세종은 2depth가 비어 시군구가 null이고 동, 읍면을 그대로 쓴다. 바다는 depth가 모두 비어 null이다.
 */
export function placeFromRegions(rows: KakaoRegion[]): Place | null {
  const b = rows.find((r) => r.region_type === "B");
  if (!b) return null;
  const d3 = (b.region_3depth_name ?? "").trim();
  const gu = (b.region_2depth_name ?? "").trim() || null;
  const lastGu = gu ? gu.split(/\s+/).pop() : null;
  const dong = !d3 ? null : !gu ? d3 : /[읍면]$/.test(d3) ? `${gu} ${d3}` : `${lastGu} ${d3}`;
  const sido = (b.region_1depth_name ?? "").trim() || null;
  return dong || gu ? { dong, gu, sido, emd: d3 || null, source: "kakao" } : null;
}

type KakaoServices = {
  maps: {
    services: {
      Geocoder: new () => { coord2RegionCode(x: number, y: number, cb: (result: KakaoRegion[], status: string) => void): void };
      Status: { OK: string; ZERO_RESULT: string; ERROR: string };
    };
  };
};

/** SDK 로드와 호출을 합친 상한(ms). 넘으면 Nominatim으로 넘어간다 */
const KAKAO_TIMEOUT_MS = 5000;

/** 카카오 SDK 호출(로드 포함). OK는 Place나 null, ZERO_RESULT는 null, ERROR나 시간 초과는 throw */
async function kakaoRegion(lat: number, lng: number): Promise<Place | null> {
  const { loadKakaoSdk } = await import("./kakao-sdk");
  const k = await loadKakaoSdk<KakaoServices>();
  if (!k.maps.services?.Geocoder) throw new Error("kakao services missing");
  const { Geocoder, Status } = k.maps.services;
  return new Promise<Place | null>((resolve, reject) => {
    new Geocoder().coord2RegionCode(lng, lat, (result, status) => {
      if (status === Status.OK) resolve(placeFromRegions(Array.isArray(result) ? result : []));
      else if (status === Status.ZERO_RESULT) resolve(null);
      else reject(new Error(`kakao ${status}`));
    });
  });
}

/** 카카오 역지오코딩(지도 JS SDK, 브라우저 직접). 줄인 좌표가 같으면 세션 동안 다시 부르지 않는다. 실패는 throw(캐시하지 않는다) */
export const kakaoGeocoder: Geocoder = {
  name: "kakao",
  attribution: "주소 변환: 카카오",
  async reverse(lat, lng) {
    const la = coarse(lat);
    const lo = coarse(lng);
    const key = `kakao:${la},${lo}`;
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;
    const { kakaoSdkFailed } = await import("./kakao-sdk");
    if (kakaoSdkFailed()) throw new Error("kakao sdk failed before");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("kakao timeout")), KAKAO_TIMEOUT_MS);
    });
    try {
      const place = await Promise.race([kakaoRegion(Number(la), Number(lo)), timeout]);
      cacheSet(key, place);
      return place;
    } finally {
      clearTimeout(timer);
    }
  },
};

/** 외부 제공자(카카오, Nominatim) 사용 스위치. 기본 켬, NEXT_PUBLIC_GEOCODER=preset이면 끈다 */
export const EXTERNAL_GEOCODE_ON = process.env.NEXT_PUBLIC_GEOCODER !== "preset";
/** 카카오 역지오코딩을 쓸 수 있는 빌드인가(지도 JS 키가 있다) */
const KAKAO_GEOCODE_ON = EXTERNAL_GEOCODE_ON && KAKAO_MAP_KEY !== "";
/** 화면 출처 표기(외부 제공자가 켜져 있을 때). 푸터는 요청마다 쓰인 제공자를 모르므로 이 빌드가 쓸 수 있는 것을 다 적는다 */
export const GEOCODE_CREDIT = KAKAO_GEOCODE_ON ? "주소 변환: 카카오, OpenStreetMap Nominatim" : "주소 변환: OpenStreetMap Nominatim";

/**
 * 역지오코딩 순서 목록(2026-11-24 결정): 카카오, Nominatim, 프리셋. 지도 JS 키가 없는 빌드는 카카오를 뺀다.
 * 스위치가 preset이면 프리셋만. 홈 내 위치 버튼과 홈 지도의 현 지도에서 검색이 이 목록을 reverseGeocode에 넘긴다.
 */
export function geocoderChain(presets: PresetPoint[]): Geocoder[] {
  const preset = presetGeocoder(presets);
  if (!EXTERNAL_GEOCODE_ON) return [preset];
  return KAKAO_GEOCODE_ON ? [kakaoGeocoder, nominatimGeocoder, preset] : [nominatimGeocoder, preset];
}

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
