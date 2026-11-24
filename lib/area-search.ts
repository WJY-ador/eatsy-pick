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
//
// 옮긴 동네 핀(2026-11-24 사용자 결정. 버튼을 눌렀을 때만 조회한다는 이전 결정을 이 기능에 한해 바꾼다):
// 홈 지도를 다른 동네로 옮기면 지금 범위는 그대로 두고, 보이는 동네의 가게를 옅은 핀으로 띄운다(목록과 브리핑에는 넣지 않는다).
// 조회 조건(싼 것부터): 제스처 이동이 끝나고 PAN_WAIT_MS 멈춤, 가로 폭 AREA_SEARCH_MAX_KM 이하, 지도 중심이 지금 매장 경계 상자 밖,
// 역지오코딩(geocoderChain, 세션 캐시)과 areaSearchPick이 지금과 다른 범위를 고름.
// 한 번 이동당 역지오코딩 1회(앞 제공자가 실패할 때만 다음 제공자로 넘어간다), 우리 서버 최대 1건(서버는 잇플 1~3건, 캐시 적중이면 0건).
// 같은 범위는 세션 동안 다시 부르지 않는다(메모리, 진행 중 요청 공유). 실패는 캐시하지 않고 조용히 넘긴다.
// 멈춤 타이머는 다음 이동이 끝날 때 지운다(새 끌기 시작으로는 지우지 않는다). 600ms 안에 다시 끌어 600ms 넘게 끌면 직전 위치를 한 번 조회한다.
// 서버 경로는 app/api/area-stores. 좌표는 우리 서버로 보내지 않는다(지역 이름이나 프리셋 slug만).

import { AREAS } from "./areas";
import type { Place } from "./geocode";
import { type HomeScope, scopeEntries } from "./home-params";
import type { Store } from "./stores";

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

/** 옮긴 동네 조회 전 멈춤(ms). 제스처 이동이 끝난 뒤 이만큼 더 움직이지 않으면 조회한다 */
export const PAN_WAIT_MS = 600;

/** 옮긴 동네 핀에 쓰는 매장 필드: 핀(id, 이름, 좌표), 프랜차이즈 제외와 테마 판정, 누르면 갈 동(주소) */
export type PanStore = Pick<Store, "id" | "name" | "address" | "lat" | "lng" | "franchise" | "ccgRank" | "local" | "hoesik" | "customer1">;

export function toPanStore(s: Store): PanStore {
  return { id: s.id, name: s.name, address: s.address, lat: s.lat, lng: s.lng, franchise: s.franchise, ccgRank: s.ccgRank, local: s.local, hoesik: s.hoesik, customer1: s.customer1 };
}

/** 점이 매장들의 경계 상자(좌표 있는 매장) 안인가. 좌표 있는 매장이 없으면 false */
export function insideStores(stores: Pick<Store, "lat" | "lng">[], p: { lat: number; lng: number }): boolean {
  let s = Number.POSITIVE_INFINITY;
  let n = Number.NEGATIVE_INFINITY;
  let w = Number.POSITIVE_INFINITY;
  let e = Number.NEGATIVE_INFINITY;
  for (const st of stores) {
    if (st.lat === null || st.lng === null) continue;
    s = Math.min(s, st.lat);
    n = Math.max(n, st.lat);
    w = Math.min(w, st.lng);
    e = Math.max(e, st.lng);
  }
  return p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
}

/** 범위별 옮긴 동네 매장(브라우저 메모리, 세션 동안). 진행 중인 요청도 담아 같은 범위를 두 번 부르지 않는다 */
const panCache = new Map<string, Promise<PanStore[] | null>>();

/** 범위의 옮긴 동네 매장을 받는다(GET /api/area-stores). 실패는 null이고 캐시에 남기지 않는다. 브라우저에서만 부른다 */
export function loadPanStores(scope: HomeScope): Promise<PanStore[] | null> {
  const qs = new URLSearchParams(scopeEntries(scope)).toString();
  const hit = panCache.get(qs);
  if (hit) return hit;
  const p = fetch(`/api/area-stores?${qs}`, { signal: AbortSignal.timeout(15000) })
    .then(async (res) => {
      if (!res.ok) throw new Error(`area-stores ${res.status}`);
      const body = (await res.json()) as { stores?: unknown };
      if (!Array.isArray(body.stores)) throw new Error("area-stores body");
      return body.stores as PanStore[];
    })
    .catch(() => {
      panCache.delete(qs);
      return null;
    });
  panCache.set(qs, p);
  return p;
}
