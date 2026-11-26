// API 필드에서 화면 라벨로 가는 매핑을 한 곳에 모은다.
// 뜻 확정(spec.md 2절, 2026-11-23): empyVsitYn = 회식 적합 Y/N, loclPrsnPpltYn = 동네맛집 Y/N,
// srtTime/endTime = 최근 1개월 결제 승인 시각 기반 영업 예상 시간, allSaleRnk = 전국 상위 %,
// ccgSaleRnk = 시군구 상위 %. frnrVsitYn은 미확정(외국인 방문 추정, 화면에 안 낸다).

const DAY_FULL: Record<string, string> = {
  월: "월요일",
  화: "화요일",
  수: "수요일",
  목: "목요일",
  금: "금요일",
  토: "토요일",
  일: "일요일",
};

export const WEEKDAYS = ["월", "화", "수", "목", "금"] as const;

/** "목", "점심" → "목요일 점심". short면 요일을 받은 그대로 둔다("목 점심", 홈 목록 행의 칩) */
export function peakLabel(day?: string, time?: string, short = false): string | null {
  const d = day ? (short ? day : (DAY_FULL[day] ?? day)) : "";
  const t = time ?? "";
  const s = `${d} ${t}`.trim();
  return s || null;
}

/** "60대이상남성" → "60대 이상 남성" */
export function customerLabel(raw: string): string {
  return raw
    .replace(/이상/, " 이상")
    .replace(/(남성|여성)$/, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

/** "HHMM" → 자정 기준 분. 형식이 틀리면 null */
export function parseHHMM(v?: string): number | null {
  if (!v || !/^\d{4}$/.test(v)) return null;
  const h = Number(v.slice(0, 2));
  const m = Number(v.slice(2));
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

/** 시작, 종료(분). 종료가 시작보다 작으면 익일로 본다(+24시간). */
export function hoursRange(srt?: string, end?: string): { start: number; end: number; overnight: boolean } | null {
  const s = parseHHMM(srt);
  const e = parseHHMM(end);
  if (s === null || e === null) return null;
  const overnight = e < s;
  return { start: s, end: overnight ? e + 24 * 60 : e, overnight };
}

function hhmm(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "11:51~22:19", 익일이면 "06:04~익일 05:58" */
export function hoursLabel(srt?: string, end?: string): string | null {
  const r = hoursRange(srt, end);
  if (!r) return null;
  return `${hhmm(r.start)}~${r.overnight ? "익일 " : ""}${hhmm(r.end)}`;
}
