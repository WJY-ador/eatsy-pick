"use client";

// 상권 랭킹 지도 열림 상태. 모듈 상태라 지역 변경(클라이언트 이동) 뒤에도 남는다. 새로고침하면 닫힌 상태로 시작한다.
// 서버와 첫 수화에서는 닫힘이다.

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setAreaMapOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export function useAreaMapOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
