// 직접 추가 지역 주소(/area/place?q=..&k=..)의 쿼리 읽기. 상권 페이지와 업종 페이지가 같이 쓴다.

import { AREA_QUERY_MAX } from "@/lib/my-areas";

export type PlaceSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** q(다시 찾을 검색어)와 k(지역 키). 비었거나 너무 길면 null */
export async function readPlace(sp: PlaceSearchParams): Promise<{ q: string; k: string } | null> {
  const p = await sp;
  const q = first(p.q).replace(/\s+/g, " ").trim();
  const k = first(p.k).trim();
  return q && k && q.length <= AREA_QUERY_MAX && k.length <= 120 ? { q, k } : null;
}
