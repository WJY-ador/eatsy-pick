// 홈 지도의 현 지도에서 검색: 지도 중심의 지역(역지오코딩 결과)과 보이는 가로 폭 W로 검색 단위를 고른다.
// 2026-11-24 사용자 결정(34곳 실측 근거). W는 경계 좌표의 서쪽 끝과 동쪽 끝 사이 거리(중심 위도 기준, km).
//   서울과 광역시의 자치구(1depth가 특별시, 광역시): W 3km 이하 동, 3~10km 구, 10km 초과 버튼 숨김
//   시와 일반구(2depth가 OO시 또는 OO시 OO구): 4km 이하 동, 4~15km 시 또는 일반구, 15km 초과 숨김
//   군(2depth가 OO군): 8km 이하 읍면, 8km 초과 숨김. 광역시 안의 군(기장군, 달성군, 군위군, 강화군, 옹진군, 울주군)도 군 규칙을 따른다
//   세종(2depth 빈 값): 동만, 3km 이하
//   종류를 모름(Nominatim, 프리셋으로 넘어감): 3km 이하일 때만 동(프리셋이면 그 상권), 넓으면 안내만
// 경계는 이하로 끊는다(3.0km는 동). 버튼은 조회 전에는 가장 넓은 기준(AREA_SEARCH_MAX_KM)까지만 띄운다.
// loc 꼴: 동은 기존 꼴(강남구 역삼동, 평창군 대관령면). 구는 시도 짧은 이름 + 구(서울 강남구, 대구 중구. 시도 없이 중구만 보내면 전국 중구가 섞인다).
// 시는 2depth 그대로(강릉시, 청주시 흥덕구).

import { AREAS } from "./areas";
import type { Place } from "./geocode";
import type { HomeScope } from "./home-params";

/** 지도가 지금 보여 주는 범위. 사용자가 움직인 뒤에만 어댑터가 알린다 */
export type MapView = { lat: number; lng: number; widthKm: number };

/** 조회 전 버튼을 띄우는 최대 가로 폭(km). 종류별 기준 중 가장 넓은 것 */
export const AREA_SEARCH_MAX_KM = 15;

export const AREA_NOTE_ZOOM = "지도를 더 확대한 뒤 눌러 주세요.";
export const AREA_NOTE_FAIL = "이 위치의 지역을 찾지 못했습니다.";

type Kind = "metro" | "city" | "county" | "sejong" | "unknown";

/** 단위별 상한(km). 동 상한, 구나 시 상한(없으면 null) */
const LIMITS: Record<Kind, { dong: number; wide: number | null }> = {
  metro: { dong: 3, wide: 10 },
  city: { dong: 4, wide: 15 },
  county: { dong: 8, wide: null },
  sejong: { dong: 3, wide: null },
  unknown: { dong: 3, wide: null },
};

function kindOf(p: Place): Kind {
  if (p.source !== "kakao" || !p.sido) return "unknown";
  if (!p.gu) return "sejong";
  if (/군$/.test(p.gu)) return "county";
  if (/(특별시|광역시)$/.test(p.sido)) return "metro";
  return "city";
}

/** 1depth 시도 이름을 짧게: 서울특별시 → 서울, 대구광역시 → 대구, 세종특별자치시 → 세종 */
export function shortSido(sido: string): string {
  return sido.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "") || sido;
}

/** 경계 좌표의 서쪽 끝과 동쪽 끝 사이 거리(km, 중심 위도 기준) */
export function widthKm(lat: number, west: number, east: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  return (6371.0088 * Math.abs(rad(east - west)) * Math.cos(rad(lat)));
}

/** 역지오코딩 결과와 W로 갈 범위를 고른다. 못 고르면 짧은 안내 */
export function areaSearchPick(place: Place | null, w: number): { scope: HomeScope } | { note: string } {
  if (!place) return { note: AREA_NOTE_FAIL };
  const kind = kindOf(place);
  const lim = LIMITS[kind];
  if (w <= lim.dong) {
    if (kind === "unknown" && place.presetSlug) {
      const a = AREAS.find((x) => x.slug === place.presetSlug);
      if (a) return { scope: { kind: "area", slug: a.slug, name: a.name } };
    }
    return place.dong ? { scope: { kind: "loc", loc: place.dong } } : { note: AREA_NOTE_FAIL };
  }
  if (lim.wide === null || w > lim.wide || !place.gu) return { note: AREA_NOTE_ZOOM };
  const loc = kind === "metro" && place.sido ? `${shortSido(place.sido)} ${place.gu}` : place.gu;
  return { scope: { kind: "loc", loc } };
}
