// Store를 화면 문구로 바꾸는 규칙. proj4를 import하지 않는다(클라이언트 번들용).

import { legalDong } from "./geocode";
import { shortSido } from "./my-areas";
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

/** 한글로 시작하는 동, 숫자 + 가 토큰만 법정동 꼴로 받는다("101동", "B동" 같은 건물 동과 "오렌지상가" 같은 상가 이름은 버린다) */
function dongToken(raw: string): string | null {
  const t = raw.trim();
  if (!/^[가-힣][가-힣\d]*$/.test(t) || (/가$/.test(t) && !/\d가$/.test(t))) return null;
  return legalDong(t);
}

function dongOf(address: string, head: string[], sigungu: number): string | null {
  for (const m of address.matchAll(/\(([^()]*)/g)) {
    const d = dongToken(m[1].split(/[,.\s]/)[0]);
    if (d) return d;
  }
  // 지번 주소: 시군구 바로 뒤 토큰. 도로명은 로, 길로 끝나 동이나 가로 끝나는 토큰과 겹치지 않는다
  const t = head[sigungu];
  return sigungu >= 1 && t && /(동|가)$/.test(t) ? dongToken(t) : null;
}

/**
 * 매장 주소(merAddr) → 상권 분석 loc("중구 다동", "분당구 백현동", "포천시 동교동"). 동 앞에 시군구를 붙인다.
 * 동 이름만으로는 다른 시군구가 섞인다(2026-11-24 실측: 다동 100건 중 서울 중구 30건, 중구 다동 98건).
 * 시와 구가 둘 다 있으면 구만 붙인다(성남시 분당구 → 분당구). 시군구가 없는 세종은 시도를 붙인다(세종 보람동).
 * 동: 도로명 주소는 괄호 안 첫 값("논현로 325 (역삼동)", "(대치동, (주)케이티앤지타워)", "(불광동.1층)", "(신림동)지하1층"),
 * 지번 주소는 시군구 바로 뒤 토큰("서울 강남구 역삼동 123-4", "서울 강남구 대치동 테헤란로 508").
 * 읍, 면 주소는 null이다. 도로명 괄호에 동이 없고 건물 이름만 있다(2026-11-24 표본 654건 중 동 0건). 구나 읍으로 대신 넓히지 않는다.
 */
export function dongLocOf(address: unknown): string | null {
  if (typeof address !== "string") return null;
  const tokens = address.split("(")[0].trim().split(/\s+/);
  const head = tokens.slice(1);
  if (head.some((t) => /[가-힣](읍|면)$/.test(t))) return null;
  let n = 0;
  while (n < head.length && /^[가-힣]+(시|군|구)$/.test(head[n])) n++;
  const dong = dongOf(address, head, n);
  if (!dong) return null;
  const area = n > 0 ? head[n - 1] : shortSido(tokens[0] ?? "");
  return area ? `${area} ${dong}` : null;
}
