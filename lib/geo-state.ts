"use client";

// 내 위치(정밀 좌표)는 이 모듈의 메모리에만 둔다. URL, 공유 링크, OG, 서버 요청, 저장소에 넣지 않는다.
// 페이지를 새로 불러오면 사라진다. 소프트 내비게이션(/?loc=...&near=1) 사이에서는 유지된다.

import { useSyncExternalStore } from "react";

export type GeoState = {
  me: { lat: number; lng: number } | null;
  /** 역지오코딩으로 얻은 시군구. 동 조회가 0건일 때 한 번 다시 조회하는 값 */
  gu: string | null;
  /** 시군구로 다시 조회했는가(한 번만) */
  retriedGu: boolean;
  locating: boolean;
  /** 진입 시 권한 확인을 이미 했는가(페이지 로드당 한 번) */
  autoChecked: boolean;
};

const INITIAL: GeoState = { me: null, gu: null, retriedGu: false, locating: false, autoChecked: false };
let state: GeoState = INITIAL;
const listeners = new Set<() => void>();

export function getGeo(): GeoState {
  return state;
}

export function setGeo(patch: Partial<GeoState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useGeo(): GeoState {
  return useSyncExternalStore(subscribe, getGeo, () => INITIAL);
}

export type LocateError = "denied" | "timeout" | "unsupported" | "unavailable";

/** 현재 위치 한 번. 8초 안에 못 받으면 timeout */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return reject("unsupported" satisfies LocateError);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject((err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable") satisfies LocateError),
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}

/** 권한이 이미 허용됐는가. Permissions API가 없거나 실패하면 false(묻지 않는다) */
export async function geolocationGranted(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return false;
    const r = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return r.state === "granted";
  } catch {
    return false;
  }
}
