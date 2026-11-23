// URL 쿼리 ↔ 조회 조건. 상태는 전부 URL에 둔다.
// area(프리셋 slug) 또는 q(자유 입력), occ, fr(0이면 프랜차이즈 제외 끔), n(묶음 번호).

import { type AreaPreset, areaBySlug, matchArea } from "./areas";
import { DEFAULT_OCCASION, type OccasionSlug, occasionBySlug } from "./occasions";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type DecideInput = {
  area?: AreaPreset;
  /** 프리셋과 안 맞는 자유 입력 */
  q?: string;
  occ: OccasionSlug;
  /** 프랜차이즈 제외(뒤로 내림) */
  excludeFranchise: boolean;
  n: number;
};

export const MAX_Q_LENGTH = 40;
export const MAX_N = 20;

function all(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
function first(v: string | string[] | undefined): string | undefined {
  return all(v)[0];
}

/** 조건이 하나도 없으면 null(첫 화면) */
export function parseQuery(sp: RawSearchParams): DecideInput | null {
  const qRaw = (first(sp.q) ?? "").trim().slice(0, MAX_Q_LENGTH);
  let area: AreaPreset | undefined;
  let q: string | undefined;
  if (qRaw) {
    area = matchArea(qRaw);
    if (!area) q = qRaw;
  } else {
    area = areaBySlug(first(sp.area));
  }
  if (!area && !q) return null;

  const occ = occasionBySlug(first(sp.occ))?.slug ?? DEFAULT_OCCASION;
  // 폼은 hidden fr=0과 체크박스 fr=1을 함께 보낼 수 있다. 1이 있으면 켬, 0만 있으면 끔, 없으면 켬.
  const frValues = all(sp.fr);
  const excludeFranchise = frValues.length === 0 || frValues.includes("1");
  const nNum = Number.parseInt(first(sp.n) ?? "1", 10);
  const n = Number.isFinite(nNum) && nNum >= 1 ? Math.min(nNum, MAX_N) : 1;
  return { area, q, occ, excludeFranchise, n };
}

/** canonical 쿼리 문자열("?area=gangnam&occ=hoesik" 꼴) */
export function toSearch(input: DecideInput, overrides: Partial<Pick<DecideInput, "n">> = {}): string {
  const qs = new URLSearchParams();
  if (input.area) qs.set("area", input.area.slug);
  else if (input.q) qs.set("q", input.q);
  qs.set("occ", input.occ);
  if (!input.excludeFranchise) qs.set("fr", "0");
  const n = overrides.n ?? input.n;
  if (n > 1) qs.set("n", String(n));
  return `?${qs.toString()}`;
}

/** 결정기 canonical 경로("/?area=gangnam&occ=hoesik"). fr 기본값과 n=1은 생략한다. */
export function canonicalPath(input: DecideInput): string {
  return `/${toSearch(input)}`;
}

/** 같은 조건의 OG 이미지 경로 */
export function ogPath(input: DecideInput): string {
  return `/og${toSearch(input)}`;
}

export function placeName(input: DecideInput): string {
  return input.area ? input.area.name : (input.q ?? "");
}

/** 결과 제목. 화면, generateMetadata, OG 이미지가 같은 문구를 쓴다. */
export function resultsTitle(input: DecideInput, count = 3): string {
  const occ = occasionBySlug(input.occ);
  const place = placeName(input);
  const name = occ?.name ?? "";
  if (input.n > 1) {
    const first = 3 * (input.n - 1) + 1;
    return `${place} ${name} ${first}~${first + 2}번째`;
  }
  return `${place} ${name} ${count}곳`;
}

/** 컨트롤 바, 토글이 쓰는 조건 → 경로. area slug가 프리셋이면 area 꼴, 아니면 q 꼴. 묶음 번호는 1로 돌린다. */
export function hrefFor(s: { area?: string; q?: string; occ: OccasionSlug; excludeFranchise: boolean }): string {
  const area = areaBySlug(s.area);
  return `/${toSearch({ area, q: area ? undefined : s.q, occ: s.occ, excludeFranchise: s.excludeFranchise, n: 1 })}`;
}
