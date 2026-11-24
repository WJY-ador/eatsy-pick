// 홈 통합 검색의 맨 낱말(다산, 망원, 강릉, 선릉)을 지역으로 푼다. 서버에서만 쓴다(카카오 키).
// 가게 이름 검색 결과와 상관없이 지역 풀이를 먼저 보고, 풀리면 홈 범위를 그 지역으로 바꾼다(app/page.tsx).

import type { SearchState } from "./home-data";
import { BARE_WORD } from "./home-params";
import { inSido } from "./my-areas";
import { type RegionPlace, regionForWord, searchRegionPlaces } from "./place";
import { type Store, searchStores } from "./stores";

/** 맨 낱말 꼴: 공백 없는 한글 2~10자. 음식, 프리셋, 동네 꼴, 역 꼴 판정은 parseHome이 먼저 한다 */
export function isBareWord(word: string): boolean {
  return BARE_WORD.test(word.trim());
}

/** 지역 이름의 마지막 단위(망원동 → 망원, 강릉시 → 강릉, 성수동2가 → 성수, 역삼1동 → 역삼) */
function stem(name: string): string {
  return name.replace(/(?:동?\d+가|\d*동|읍|면|시|군|구)$/, "");
}

/**
 * 후보가 그 낱말의 지역인가. 역은 이름이 낱말 + 역(선릉 → 선릉역)일 때만,
 * 구, 동은 마지막 이름이 낱말과 같거나 단위를 뗀 이름이 낱말과 같을 때만 받는다.
 * 카카오 주소 검색은 앞부분 일치라 다른 이름(서면 → 연서면)도 돌려준다.
 */
export function matchesWord(p: RegionPlace, word: string): boolean {
  if (p.kind === "station") return p.name === `${word}역`;
  const last = p.name.trim().split(/\s+/).pop() ?? "";
  return last === word || stem(last) === word;
}

/** 이름 검색 결과 중 그 후보의 시군구(와 시도)에 있는 가게 수 */
export function hitsIn(p: RegionPlace, stores: Store[]): number {
  if (!p.sigungu) return stores.filter((s) => inSido(s.address, p.sido)).length;
  return stores.filter((s) => s.sigungu === p.sigungu && inSido(s.address, p.sido)).length;
}

/**
 * 후보 고르기. 이름 검색 결과가 가장 많이 몰린 시군구의 후보, 같으면 카카오 순서(역 다음 구, 동)를 따른다.
 * 다산: 다산동(남양주시)과 다산면(고령군) 중 이름 검색 결과가 몰린 남양주시 다산동.
 */
export function pickRegion(places: RegionPlace[], word: string, stores: Store[]): RegionPlace | null {
  let best: RegionPlace | null = null;
  let bestHits = -1;
  for (const p of places) {
    if (!matchesWord(p, word)) continue;
    const n = hitsIn(p, stores);
    if (n > bestHits) {
      best = p;
      bestHits = n;
    }
  }
  return best;
}

/** 고른 후보의 홈 범위(loc). 역은 시도 + 역 이름(같은 이름 역을 가른다), 구와 동은 잇플 조회 범위 */
export function locOf(p: RegionPlace): string {
  return p.kind === "station" ? p.q : p.range;
}

/** 맨 낱말의 지역 후보(카카오 2건). 낱말 꼴이 아니거나, 키가 없거나, 실패하면 null. 이름 검색과 함께 부른다 */
export async function wordPlaces(word: string): Promise<RegionPlace[] | null> {
  const w = word.trim();
  return isBareWord(w) ? searchRegionPlaces(w) : null;
}

/** 후보와 이름 검색 결과 → 홈 범위(loc). 맞는 후보가 없으면 null */
export function regionLoc(places: RegionPlace[] | null, word: string, stores: Store[]): string | null {
  const p = places ? pickRegion(places, word.trim(), stores) : null;
  return p ? locOf(p) : null;
}

export type NameLookup = { search: SearchState; region: string | null };

/**
 * 가게 이름 검색. free(주소에 지역 범위가 없음)면 맨 낱말의 지역 풀이를 함께 해서 region에 지역 조회용 loc를 준다.
 * 지역 풀이 순서: 카카오 지역 후보(동, 읍, 면, 시, 군, 구, 역) 중 낱말과 이름이 맞는 것, 여럿이면 이름 검색 결과가 몰린 시군구.
 * 후보가 없고 이름 검색이 0곳이면 명소, 공원 이름(낙산공원)을 본다(regionForWord).
 * 홈(app/page.tsx)과 상권 분석의 맨 낱말 검색(app/analysis/page.tsx)이 같이 쓴다.
 */
export async function lookupName(q: string, free: boolean): Promise<NameLookup> {
  const [found, places] = await Promise.all([
    searchStores(q).then(
      (r): SearchState => ({ status: r.stores.length ? "ok" : "empty", query: r.query, stores: r.stores }),
      (): SearchState => ({ status: "error", query: q, stores: [] }),
    ),
    free ? wordPlaces(q) : Promise.resolve(null),
  ]);
  if (!free) return { search: found, region: null };
  const region = regionLoc(places, q, found.stores) ?? (found.status === "empty" ? await regionForWord(q) : null);
  return { search: found, region };
}
