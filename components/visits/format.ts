// 방문 기록 화면의 표시 형식. 날짜는 한국 시간(KST) 기준이다.

import type { Reaction } from "@/lib/visits";

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
