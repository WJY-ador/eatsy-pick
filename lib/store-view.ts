// Store를 화면 문구로 바꾸는 규칙. proj4를 import하지 않는다(클라이언트 번들용).

import { customerLabel, hoursLabel, peakLabel } from "./labels";
import type { Store } from "./stores";

/** 백분위: 원본 수치 그대로 "0.04%", "26.71%", "100%". 누락은 "정보 없음". 올림, 반올림 금지. */
export function percentLabel(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${String(v)}%` : "정보 없음";
}

/** 두 지점 직선거리(m), 하버사인 */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number | null; lng: number | null }): number | null {
  if (b.lat === null || b.lng === null) return null;
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 거리 표기: 1km 미만은 10m 단위, 그 이상은 0.1km 단위 */
export function distanceLabel(m: number | null): string | null {
  if (m === null) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function peakOf(s: Pick<Store, "peakDay" | "peakTime">): string | null {
  return peakLabel(s.peakDay ?? undefined, s.peakTime ?? undefined);
}

export function hoursOf(s: Pick<Store, "open" | "close">): string | null {
  return hoursLabel(s.open ?? undefined, s.close ?? undefined);
}

export function customersOf(s: Pick<Store, "customers">): string[] {
  return s.customers.map(customerLabel);
}

const CORP = /\(주\)|㈜|주식회사|유한회사|\(유\)|\(사\)|사단법인|재단법인/g;

/**
 * 화면에 보이는 상호. 법인 표기를 떼고, 슬래시로 붙은 법인명 조각("…/주식회사 바나플에프엔", "(주)웨스트사이공/할리스커피")은 뺀다.
 * 검색 조회에 쓰는 원문(q)과 merUrl에는 쓰지 않는다. 화면 표시 전용이다.
 */
export function displayName(name: string): string {
  const tidy = (v: string) => v.replace(CORP, "").replace(/\s+/g, " ").trim();
  const parts = name.split("/");
  if (parts.length > 1) {
    const kept = parts.filter((p) => !new RegExp(CORP.source).test(p)).map(tidy).filter(Boolean);
    if (kept.length > 0) return kept.join("/");
  }
  return tidy(name) || name;
}
