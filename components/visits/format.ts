// 방문 기록 화면의 표시 형식. 날짜는 한국 시간(KST) 기준이다.

import { useSyncExternalStore } from "react";
import type { Reaction, VisitEntry } from "@/lib/visits";
import { percentLabel } from "@/lib/store-view";

export const REACTION_LABEL: Record<Reaction, string> = {
  again: "다시 갈래요",
  other: "다른 곳 볼래요",
};

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** ISO 시각을 "2026년 11월 23일"로 적는다. 깨진 값은 "날짜 정보 없음" */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "날짜 정보 없음";
  const parts = DATE_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}년 ${get("month")}월 ${get("day")}일`;
}

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 시각(ms)이 속한 KST 날짜 번호. 두 값의 차가 KST 기준 지난 날수다 */
export function kstDay(ms: number): number {
  return Math.floor((ms + KST_MS) / DAY_MS);
}

/**
 * 마지막 다녀왔어요 뒤 지난 날수를 KST 날짜로 센다. 미래 시각은 0일로 본다.
 * 방문이 없거나 날짜가 모두 깨졌거나 오늘 날짜를 아직 모르면(서버, 첫 수화) null.
 */
export function daysSinceLast(visits: readonly VisitEntry[], today: number | null): number | null {
  if (today === null) return null;
  // 깨진 날짜는 빼고 센다(하나가 깨져도 나머지로 마지막 방문을 찾는다).
  const times = visits.map((v) => new Date(v.at).getTime()).filter(Number.isFinite);
  if (times.length === 0) return null;
  return Math.max(0, today - kstDay(Math.max(...times)));
}

/** 마지막 다녀왔어요 뒤 지난 날수 표기: 오늘 방문, 어제 방문, N일 전 방문. 모르면 null */
export function sinceLabel(visits: readonly VisitEntry[], today: number | null): string | null {
  const days = daysSinceLast(visits, today);
  if (days === null) return null;
  if (days === 0) return "오늘 방문";
  if (days === 1) return "어제 방문";
  return `${days}일 전 방문`;
}

/**
 * 저장할 때와 지금의 지역 매출 순위. 둘 다 수이고 서로 다를 때만 값을 준다(같거나 하나라도 모르면 null).
 * 판단 단어(오름, 내림)는 붙이지 않는다. 화면은 저장할 때 상위 0.5%, 지금 상위 1.2%로 적는다.
 */
export function rankCompare(savedRank: number | null, nowRank: number | null | undefined): { saved: string; now: string } | null {
  if (typeof savedRank !== "number" || !Number.isFinite(savedRank)) return null;
  if (typeof nowRank !== "number" || !Number.isFinite(nowRank)) return null;
  if (savedRank === nowRank) return null;
  return { saved: percentLabel(savedRank), now: percentLabel(nowRank) };
}

function subscribeToday(cb: () => void): () => void {
  // 자정을 넘기거나 탭으로 돌아오면 다시 센다.
  const timer = window.setInterval(cb, 60_000);
  document.addEventListener("visibilitychange", cb);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", cb);
  };
}

/** 오늘의 KST 날짜 번호. 서버와 첫 수화에서는 null(기록도 그때는 비어 있다) */
export function useKstToday(): number | null {
  return useSyncExternalStore(
    subscribeToday,
    () => kstDay(Date.now()),
    () => null,
  );
}
