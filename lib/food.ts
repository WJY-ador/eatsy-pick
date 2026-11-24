// 음식 표현 → API 업종(merTpbuzNm) 대응표. 한 곳에만 둔다.
// 업종 값은 2026-11-23 실측 응답(강남역, 을지로, 성수)에 나온 이름 그대로다.
// 업종을 확인한 것이지 그 메뉴를 판다는 뜻이 아니다. 화면에는 업종 이름만 쓴다.

const TABLE: [string[], string][] = [
  [["고기", "고깃집", "삼겹살"], "고기구이"],
  [["회", "횟집"], "횟집"],
  [["초밥", "스시"], "스시/초밥"],
  [["치킨"], "치킨"],
  [["국밥", "찌개"], "찜/탕/찌개"],
  [["국수", "면", "만두"], "국수/면/만두"],
  [["카페", "커피"], "카페"],
  [["술집", "호프", "맥주"], "호프"],
  [["이자카야"], "이자카야"],
  [["피자"], "피자"],
  [["버거", "햄버거"], "버거"],
  [["분식", "떡볶이"], "분식"],
  [["중식", "짜장면"], "기타중식"],
  [["돈가스"], "일식돈가스"],
  [["족발", "보쌈"], "족발/보쌈"],
  [["곱창"], "곱창전골/구이"],
];

/** 대응표의 업종 값. 블로그 초안 검사(scripts/blog-check.mjs)가 업종 이름 어휘로 쓴다 */
export const FOOD_CATEGORIES: string[] = TABLE.map(([, cat]) => cat);

const BY_WORD = new Map<string, string>(TABLE.flatMap(([words, cat]) => words.map((w) => [w, cat] as [string, string])));

/** 검색어 전체가 대응표의 음식 표현이면 그 업종, 아니면 null(상호나 동네 검색으로 간다) */
export function foodCategory(input: string): string | null {
  const key = input.replace(/\s+/g, "");
  return BY_WORD.get(key) ?? null;
}

/** 화면에 쓰는 음식 분류 이름. API 조회 업종 값과 매장 원본 업종은 그대로 두고 조회 조건 이름만 바꾼다.
 *  예외 표에 있으면 그 값, 없으면 업종 이름을 그대로 쓴다(찜/탕/찌개 → "찜/탕/찌개").
 *  업종 이름처럼 "/"로 나누므로 제목의 테마 쉼표("강남역 찜/탕/찌개 맛집, 회식 적합")와 겹치지 않는다 */
const DISPLAY: Record<string, string> = {
  고기구이: "고기/육류",
  횟집: "회",
  기타중식: "중식",
  일식돈가스: "돈가스",
  "곱창전골/구이": "곱창",
};
export function foodDisplayName(category: string): string {
  return DISPLAY[category] ?? category;
}
