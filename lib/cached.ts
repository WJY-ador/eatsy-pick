// 상권 리포트(/area)용 6시간 캐시 검색. Cache Components의 'use cache' + cacheLife.
// (동, 업종) 호출 하나가 캐시 단위다. 실패는 throw로 올려 캐시에 남기지 않는 것을 의도한다.
// 이 파일은 next/cache를 쓰므로 app에서만 import한다(lib의 다른 모듈은 Node 스크립트에서도 돈다).

import { cacheLife } from "next/cache";
import { type EatplItem, type SearchParams, createSearch } from "./eatpl";

export const AREA_CACHE_SECONDS = 21600;
const raw = createSearch(AREA_CACHE_SECONDS);

export async function searchCached6h(params: SearchParams): Promise<EatplItem[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: AREA_CACHE_SECONDS, expire: 86400 });
  // 이 본문은 캐시 미스일 때만 돈다. EATPL_LOG=1이면 미스를 한 줄 남긴다(판정 7 검증용).
  if (process.env.EATPL_LOG) console.log(`[eatpl:area-miss] ${params.location}|${params.merTpbuzNm}`);
  return raw(params);
}
