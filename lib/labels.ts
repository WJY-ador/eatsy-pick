// API 필드에서 화면 라벨로 가는 매핑을 한 곳에 모은다.
// 뜻 확정(spec.md 2절, 2026-11-23): empyVsitYn = 회식 적합 Y/N, loclPrsnPpltYn = 동네맛집 Y/N,
// srtTime/endTime = 최근 1개월 결제 승인 시각 기반 영업 예상 시간, allSaleRnk = 전국 상위 %,
// ccgSaleRnk = 시군구 상위 %. frnrVsitYn은 미확정(외국인 방문 추정, 화면에 안 낸다).

export const FIELD_LABELS = {
  /** 회식 적합 Y/N */
  empyVsitYn: "회식 적합",
  /** 동네맛집 Y/N */
  loclPrsnPpltYn: "동네맛집",
  /** 미확정: 외국인 방문 추정 */
  frnrVsitYn: "외국인 방문 많음(추정)",
  /** srtTime~endTime */
  hours: "예상 영업시간",
  /** 예상 영업시간 옆 작은 설명 */
  hoursNote: "결제 시각 기준 추정",
  peak: "가장 붐비는 때",
  customers: "주 고객층",
  holidays: "휴무",
  address: "주소",
} as const;

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

/** "목", "점심" → "목요일 점심" */
export function peakLabel(day?: string, time?: string): string | null {
  const d = day ? (DAY_FULL[day] ?? day) : "";
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

/** vistCstmrRnkList → 1~3위 라벨 */
export function topCustomers(list?: Record<string, string>): string[] {
  if (!list) return [];
  return ["rk01", "rk02", "rk03"]
    .map((k) => list[k])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(customerLabel);
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

/** 휴무 요일 배열 → "토, 일" */
export function holidaysLabel(days?: string[]): string | null {
  if (!days || days.length === 0) return null;
  return days.join(", ");
}

/** "HH:MM~HH:MM" 짧은 꼴(익일 표시 없음). 카드 보조 줄용 */
export function hoursShort(srt?: string, end?: string): string | null {
  const r = hoursRange(srt, end);
  if (!r) return null;
  return `${hhmm(r.start)}~${hhmm(r.end)}`;
}

/** 시군구 상위 % 태그 숫자: 1 미만은 소수 한 자리(최소 0.1), 1 이상은 반올림 정수(최대 100). "0%"는 내지 않는다. */
export function topPercent(v: number): string {
  if (v < 1) return Math.max(0.1, v).toFixed(1);
  return String(Math.min(100, Math.round(v)));
}

export type Tag = { key: "rank" | "fit" | "peak" | "cust" | "local"; text: string };

/**
 * 날것 값을 짧은 태그로 바꾼다. 우선순위: 상위 %, 회식 적합, 피크, 고객층 1위, 동네맛집. 최대 max개.
 * 회식 적합은 "추천"이라 쓰지 않고, 고객층은 직업을 쓰지 않는다(데이터에 직업이 없다).
 */
export function buildTags(
  item: {
    ccgSaleRnk?: number;
    empyVsitYn?: boolean;
    loclPrsnPpltYn?: boolean;
    congestionDwk?: string;
    congestionTizn?: string;
    vistCstmrRnkList?: Record<string, string>;
  },
  sigungu: string,
  max = 4,
): Tag[] {
  const tags: Tag[] = [];
  if (typeof item.ccgSaleRnk === "number") tags.push({ key: "rank", text: `${sigungu} 상위 ${topPercent(item.ccgSaleRnk)}%` });
  if (item.empyVsitYn) tags.push({ key: "fit", text: FIELD_LABELS.empyVsitYn });
  const peak = peakLabel(item.congestionDwk, item.congestionTizn);
  if (peak) tags.push({ key: "peak", text: `${peak} 피크` });
  const rk01 = item.vistCstmrRnkList?.rk01;
  if (rk01) tags.push({ key: "cust", text: `${customerLabel(rk01)} 1위` });
  if (item.loclPrsnPpltYn) tags.push({ key: "local", text: FIELD_LABELS.loclPrsnPpltYn });
  return tags.slice(0, max);
}
