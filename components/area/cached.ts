// 지역 후보, 직접 추가 지역 풀기, 머리말 검색 자동완성 장소의 캐시('use cache'). 장소 좌표와 주소는 거의 바뀌지 않아 하루 동안 재사용한다.
// 카카오 호출이 실패하면 throw로 올려 캐시에 남기지 않는다. next/cache를 쓰므로 app 쪽에서만 import한다.

import { cacheLife } from "next/cache";
import type { AreaCandidate } from "@/lib/my-areas";
import { suggestPlaces } from "@/lib/place";
import type { Suggestion } from "@/lib/suggest";
import { type AreaView, areaCandidates, resolvePlaceView } from "./view";

const PLACE_CACHE = { stale: 3600, revalidate: 86400, expire: 604800 };

export async function areaCandidatesCached(query: string): Promise<AreaCandidate[]> {
  "use cache";
  cacheLife(PLACE_CACHE);
  return areaCandidates(query);
}

export async function resolvePlaceCached(q: string, k: string): Promise<AreaView | null> {
  "use cache";
  cacheLife(PLACE_CACHE);
  return resolvePlaceView(q, k);
}

export async function suggestPlacesCached(query: string): Promise<Suggestion[]> {
  "use cache";
  cacheLife(PLACE_CACHE);
  const items = await suggestPlaces(query);
  if (!items) throw new Error("place suggest failed");
  return items;
}
