// 프리셋 상권 표. 좌표는 API의 xaxsVal/yaxsVal과 같은 TM128 평면 좌표(미터)다.
// dongs는 중심에 가까운 순이다. 2026-11-23 실측: 동 하나를 location으로만 조회해
// 허용 시군구 안 결과의 중심 거리 중앙값(m)으로 줄을 세웠다(괄호 안 숫자).
// 호출 예산을 넘으면 앞에서부터 남긴다.

export type AreaPreset = {
  slug: string;
  /** 화면 이름 */
  name: string;
  /** "강남역 중심에서" 같은 거리 문구에 쓰는 이름 */
  centerName: string;
  /** 정규화한 별칭(공백 없음, 끝의 '역' 없음) */
  aliases: string[];
  dongs: string[];
  /** 주소 두 번째 토큰(시군구)과 맞춘다 */
  sigungu: string[];
  center: { x: number; y: number };
  radius: number;
};

export const DEFAULT_RADIUS = 700;
export const RADIUS_STEPS: (number | null)[] = [700, 1000, 1500, null];

export const AREAS: AreaPreset[] = [
  { slug: "gangnam", name: "강남역", centerName: "강남역", aliases: ["강남"], dongs: ["역삼동" /* 419 */, "서초동" /* 1457 */], sigungu: ["강남구", "서초구"], center: { x: 314276, y: 544442 }, radius: DEFAULT_RADIUS },
  { slug: "yeoksam", name: "역삼", centerName: "역삼역", aliases: ["역삼"], dongs: ["역삼동"], sigungu: ["강남구"], center: { x: 315380, y: 544738 }, radius: DEFAULT_RADIUS },
  { slug: "seolleung", name: "선릉", centerName: "선릉역", aliases: ["선릉"], dongs: ["대치동" /* 841 */, "삼성동" /* 970 */, "역삼동" /* 2113 */], sigungu: ["강남구"], center: { x: 316339, y: 545124 }, radius: DEFAULT_RADIUS },
  { slug: "samseong", name: "삼성", centerName: "삼성역", aliases: ["삼성", "코엑스"], dongs: ["삼성동" /* 466 */, "대치동" /* 1077 */], sigungu: ["강남구"], center: { x: 317214, y: 545560 }, radius: DEFAULT_RADIUS },
  { slug: "yeouido", name: "여의도", centerName: "여의도역", aliases: ["여의도", "여의도동"], dongs: ["여의도동"], sigungu: ["영등포구"], center: { x: 305126, y: 547170 }, radius: DEFAULT_RADIUS },
  { slug: "pangyo", name: "판교", centerName: "판교역", aliases: ["판교", "판교테크노밸리"], dongs: ["삼평동" /* 397 */, "백현동" /* 444 */], sigungu: ["성남시"], center: { x: 321440, y: 533256 }, radius: DEFAULT_RADIUS },
  { slug: "jeongja", name: "정자", centerName: "정자역", aliases: ["정자"], dongs: ["정자동"], sigungu: ["성남시"], center: { x: 321053, y: 529319 }, radius: DEFAULT_RADIUS },
  { slug: "seongsu", name: "성수", centerName: "성수역", aliases: ["성수", "성수동"], dongs: ["성수동2가" /* 334 */, "성수동1가" /* 905 */], sigungu: ["성동구"], center: { x: 316741, y: 549516 }, radius: DEFAULT_RADIUS },
  { slug: "euljiro", name: "을지로", centerName: "을지로입구역", aliases: ["을지로", "을지로입구"], dongs: ["을지로2가" /* 322 */, "을지로3가" /* 337 */, "다동" /* 592 */, "을지로1가" /* 725 */, "무교동" /* 779 */], sigungu: ["중구"], center: { x: 310760, y: 552000 }, radius: DEFAULT_RADIUS },
  { slug: "gwanghwamun", name: "광화문", centerName: "광화문역", aliases: ["광화문"], dongs: ["당주동" /* 167 */, "도렴동" /* 264 */, "신문로" /* 287 */, "내수동" /* 343 */, "종로1가" /* 349 */, "청진동" /* 394 */], sigungu: ["종로구"], center: { x: 309755, y: 552669 }, radius: DEFAULT_RADIUS },
  { slug: "jonggak", name: "종각", centerName: "종각역", aliases: ["종각"], dongs: ["관철동" /* 245 */, "서린동" /* 259 */, "종로1가" /* 336 */, "청진동" /* 353 */], sigungu: ["종로구"], center: { x: 310377, y: 552388 }, radius: DEFAULT_RADIUS },
  { slug: "hongdae", name: "홍대", centerName: "홍대입구역", aliases: ["홍대", "홍대입구", "홍익대"], dongs: ["동교동" /* 309 */, "서교동" /* 535 */, "연남동" /* 764 */], sigungu: ["마포구"], center: { x: 304920, y: 550936 }, radius: DEFAULT_RADIUS },
  { slug: "hapjeong", name: "합정", centerName: "합정역", aliases: ["합정"], dongs: ["합정동" /* 282 */, "서교동" /* 664 */], sigungu: ["마포구"], center: { x: 304292, y: 550318 }, radius: DEFAULT_RADIUS },
  { slug: "gongdeok", name: "공덕", centerName: "공덕역", aliases: ["공덕"], dongs: ["공덕동" /* 231 */, "도화동" /* 346 */], sigungu: ["마포구"], center: { x: 307530, y: 549661 }, radius: DEFAULT_RADIUS },
  { slug: "sindorim", name: "신도림", centerName: "신도림역", aliases: ["신도림"], dongs: ["신도림동" /* 383 */, "구로동" /* 2547 */], sigungu: ["구로구"], center: { x: 301581, y: 545583 }, radius: DEFAULT_RADIUS },
  { slug: "gurodigital", name: "구로디지털", centerName: "구로디지털단지역", aliases: ["구로디지털", "구로디지털단지", "구디"], dongs: ["구로동"], sigungu: ["구로구"], center: { x: 302466, y: 543869 }, radius: DEFAULT_RADIUS },
  { slug: "gasan", name: "가산디지털", centerName: "가산디지털단지역", aliases: ["가산디지털", "가산디지털단지", "가산", "가디"], dongs: ["가산동"], sigungu: ["금천구"], center: { x: 301281, y: 542565 }, radius: DEFAULT_RADIUS },
  { slug: "magok", name: "마곡", centerName: "마곡역", aliases: ["마곡", "마곡나루"], dongs: ["마곡동"], sigungu: ["강서구"], center: { x: 296565, y: 552383 }, radius: DEFAULT_RADIUS },
  { slug: "jamsil", name: "잠실", centerName: "잠실역", aliases: ["잠실"], dongs: ["신천동" /* 238 */, "잠실동" /* 1673 */], sigungu: ["송파구"], center: { x: 320796, y: 546120 }, radius: DEFAULT_RADIUS },
];

const BY_SLUG = new Map(AREAS.map((a) => [a.slug, a]));

export function areaBySlug(slug: string | undefined | null): AreaPreset | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** 공백 제거, 끝의 '역' 제거 */
export function normalizePlace(input: string): string {
  return input.replace(/\s+/g, "").replace(/역$/, "");
}

