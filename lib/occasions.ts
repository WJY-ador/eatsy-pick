// 모임 성격별 업종 묶음과 적합 조건.
// 조건은 API 필드만으로 판정한다. 지어낸 지표를 만들지 않는다.

import type { EatplItem } from "./eatpl";
import { FIELD_LABELS, WEEKDAYS, hoursRange } from "./labels";

export type OccasionSlug = "hoesik" | "jeopdae" | "lunch" | "drink";

export type Criterion = {
  /** 카드에 그대로 찍는 조건 이름. 쉼표를 넣지 않는다(목록 구분자와 겹친다). */
  label: string;
  test: (item: EatplItem) => boolean;
};

/** 조건 수와 별개인 가점. 카드에는 따로 표시한다(예: 회식 적합 표시). */
export type Bonus = { label: string; points: number; test: (item: EatplItem) => boolean };

export type Occasion = {
  slug: OccasionSlug;
  name: string;
  categories: string[];
  criteria: Criterion[];
  bonus?: Bonus;
};

const isWeekdayPeak = (i: EatplItem) => (WEEKDAYS as readonly string[]).includes(i.congestionDwk ?? "");
const peakIn = (...slots: string[]) => (i: EatplItem) => slots.includes(i.congestionTizn ?? "");
const endsAtOrAfter = (hour: number) => (i: EatplItem) => {
  const r = hoursRange(i.srtTime, i.endTime);
  return r !== null && r.end >= hour * 60;
};
const startsBefore = (min: number) => (i: EatplItem) => {
  const r = hoursRange(i.srtTime, i.endTime);
  return r !== null && r.start < min;
};
const fitForHoesik = (i: EatplItem) => i.empyVsitYn === true;
const customersInclude = (...ages: string[]) => (i: EatplItem) =>
  ["rk01", "rk02", "rk03"].some((k) => ages.some((a) => (i.vistCstmrRnkList?.[k] ?? "").startsWith(a)));

export const OCCASIONS: Occasion[] = [
  {
    slug: "hoesik",
    name: "회식",
    categories: ["고기구이", "곱창전골/구이", "족발/보쌈", "횟집", "해산물구이/찜", "찜/탕/찌개"],
    criteria: [
      { label: "저녁이나 심야에 가장 붐빔", test: peakIn("저녁", "심야") },
      { label: "평일 피크", test: isWeekdayPeak },
      { label: "21시 넘어 영업", test: endsAtOrAfter(21) },
    ],
    // 회식 적합 Y/N은 회식에서 가장 큰 가점이다(4점, 조건 하나는 2점). true가 10~16%뿐이라 필터로 쓰지 않는다.
    bonus: { label: FIELD_LABELS.empyVsitYn, points: 4, test: fitForHoesik },
  },
  {
    slug: "jeopdae",
    name: "접대",
    categories: ["스시/초밥", "백반/한정식", "횟집", "이탈리아음식", "고기구이", "기타일식"],
    criteria: [
      { label: "저녁에 가장 붐빔", test: peakIn("저녁") },
      { label: "주 고객층에 40대나 50대", test: customersInclude("40대", "50대") },
      { label: "시군구 매출 상위 20% 이내", test: (i) => typeof i.ccgSaleRnk === "number" && i.ccgSaleRnk <= 20 },
    ],
  },
  {
    slug: "lunch",
    name: "점심",
    categories: ["백반/한정식", "찜/탕/찌개", "국수/면/만두", "기타한식", "일식돈가스", "기타중식"],
    criteria: [
      { label: "점심에 가장 붐빔", test: peakIn("점심") },
      { label: "평일 피크", test: isWeekdayPeak },
      { label: "11시 30분 전 시작", test: startsBefore(11 * 60 + 30) },
    ],
  },
  {
    slug: "drink",
    name: "한잔",
    categories: ["호프", "이자카야", "기타주점", "바(bar)", "치킨", "양꼬치"],
    criteria: [
      { label: "저녁이나 밤에 가장 붐빔", test: peakIn("저녁", "심야", "새벽") },
      { label: "23시 넘어 영업", test: endsAtOrAfter(23) },
    ],
  },
];

const BY_SLUG = new Map(OCCASIONS.map((o) => [o.slug, o]));

export const DEFAULT_OCCASION: OccasionSlug = "hoesik";

export function occasionBySlug(slug: string | undefined | null): Occasion | undefined {
  return slug ? BY_SLUG.get(slug as OccasionSlug) : undefined;
}

export function evaluate(occ: Occasion, item: EatplItem): { met: string[]; total: number; bonus: number } {
  const met = occ.criteria.filter((c) => c.test(item)).map((c) => c.label);
  const bonus = occ.bonus && occ.bonus.test(item) ? occ.bonus.points : 0;
  return { met, total: occ.criteria.length, bonus };
}
