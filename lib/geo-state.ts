"use client";

// 내 위치(정밀 좌표)는 이 모듈의 메모리에만 둔다. URL, 공유 링크, OG, 서버 요청, 저장소에 넣지 않는다.
// 페이지를 새로 불러오면 사라진다. 소프트 내비게이션(/?loc=...&near=1) 사이에서는 유지된다.
// 저장소에는 홈이 이 세션에 권한 창을 이미 띄웠는지 표시 하나만 둔다(sessionStorage, 좌표 없음).

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

/**
 * 위치를 못 받은 까닭. 거부 응답(PERMISSION_DENIED)은 사이트 권한 상태로 둘로 나눈다.
 * blocked: 이 사이트의 위치 사용이 꺼져 있다(권한 상태 denied).
 * off: 권한 상태가 denied가 아닌데 거부 응답이 왔다. 기기나 브라우저의 위치 서비스가 꺼진 경우가 많고,
 *      권한 창을 고르지 않고 닫았거나 앱 안 브라우저가 막은 경우도 여기로 온다.
 */
export type LocateError = "blocked" | "off" | "timeout" | "unsupported" | "unavailable";

/** 사이트 위치 권한 상태. Permissions API가 없거나 실패하면 null */
export async function geolocationPermission(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    const r = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return r.state;
  } catch {
    return null;
  }
}

/** 현재 위치 한 번. 8초 안에 못 받으면 timeout */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return reject("unsupported" satisfies LocateError);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          void geolocationPermission().then((st) => reject((st === "denied" ? "blocked" : "off") satisfies LocateError));
          return;
        }
        reject((err.code === err.TIMEOUT ? "timeout" : "unavailable") satisfies LocateError);
      },
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}

const AUTO_ASKED_KEY = "eatsy:geo-asked";

/** 홈이 이 세션에 권한 창을 이미 띄웠는가. 저장소를 못 쓰면 띄운 것으로 본다(새로 열 때마다 다시 묻지 않게) */
export function autoAskedInSession(): boolean {
  try {
    return window.sessionStorage.getItem(AUTO_ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markAutoAsked() {
  try {
    window.sessionStorage.setItem(AUTO_ASKED_KEY, "1");
  } catch {
    // 저장소를 못 쓰면 autoAskedInSession이 이미 참이다
  }
}
