"use client";

import { useEffect } from "react";

/**
 * 서버가 맨 낱말 검색을 지역으로 풀었으면 주소를 그 지역 꼴(loc + q)로 바꾼다. 서버를 다시 부르지 않는다.
 * 그래야 새로고침, 공유, 머리말의 맛집 둘러보기 링크가 같은 지역을 본다. 스크립트가 없으면 주소만 그대로다(화면은 같다).
 * 영수증(id)처럼 그사이 화면이 붙인 값은 남긴다.
 */
export function ResolvedUrl({ to }: { to: string }) {
  useEffect(() => {
    const next = new URLSearchParams(to.replace(/^\/\?/, ""));
    const now = new URLSearchParams(window.location.search);
    const id = now.get("id");
    if (id && !next.has("id")) next.set("id", id);
    const url = `/?${next.toString()}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, [to]);
  return null;
}
