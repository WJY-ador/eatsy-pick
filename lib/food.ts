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

/** 대응표의 음식 표현(표 순서). 머리말 검색 자동완성(lib/suggest.ts)이 쓴다 */
export const FOOD_WORDS: string[] = TABLE.flatMap(([words]) => words);

const BY_WORD = new Map<string, string>(TABLE.flatMap(([words, cat]) => words.map((w) => [w, cat] as [string, string])));

/**
 * 검색어 전체가 대응표의 음식 표현이면 그 업종, 아니면 null(상호나 동네 검색으로 간다).
 * 대응표에 없어도 잇플 업종 분류 이름(아래 MENU_CATEGORIES 43종, 기타 제외)과 같으면 그 이름을 업종으로 읽는다
 * (오늘 뭐먹지의 전체 보기가 q=마라탕 꼴로 홈 음식 조건을 건다). 대응표(TABLE)에는 넣지 않는다(FOOD_WORDS, FOOD_CATEGORIES가 바뀐다).
 */
export function foodCategory(input: string): string | null {
  const key = input.replace(/\s+/g, "");
  return BY_WORD.get(key) ?? (key !== VAGUE_CATEGORY && isMenuCategory(key) ? key : null);
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

// ---------- 잇플 업종 분류표 ----------
// 출처: 잇플 가맹점 검색 API 정의서 부록 업종 분류표(https://eatpl.dothome.co.kr/api/, 2026-11-26 확인).
// 두 체계는 서로 독립이다(포함 관계 아님). merTpbuzNm에 어느 체계의 값을 넣어도 검색된다.
// 응답 merTpbuzNm은 정의서 기준 소분류(AI 업종명), 없으면 대분류다. 실제 응답에는 이 표에 없는 값(호프, 횟집, 기타중식, 이자카야 등)도 온다(2026-11-26 역삼동 조회).
// 경계: 정의서 표는 칸마다 값 하나다. 일식돈가스, 일식라멘은 한 값이다(정의서 칸 경계, 위 대응표와 lib/category-image.ts의 실제 응답 값,
// 2026-11-26 역삼동 조회에서 그 값으로 그 업종만 돌아왔다). 일식 + 돈가스로 나누지 않는다.
// 이 파일은 import가 없다(scripts/blog-check.mjs가 node로 바로 읽는다). 홈 음식 조건(foodCategory)과 오늘 뭐먹지(lib/today-menu.ts, /api/menu-stores)가 같이 쓴다.

/** 소분류(AI 업종 분류) 34종. 정의서 순서 그대로 */
export const AI_CATEGORIES = [
  "카페",
  "고기구이",
  "찜/탕/찌개",
  "치킨",
  "국수/면/만두",
  "해산물구이/찜",
  "김밥전문점",
  "분식",
  "기타외국식",
  "곱창전골/구이",
  "피자",
  "족발/보쌈",
  "버거",
  "스시/초밥",
  "브런치카페/샐러드",
  "떡볶이전문점",
  "빵/도넛",
  "도시락/죽",
  "일식돈가스",
  "뷔페",
  "마라탕",
  "이탈리아음식",
  "샌드위치/토스트",
  "양꼬치",
  "아시안",
  "아이스크림/요거트/빙수",
  "전/부침개",
  "기타베이커리",
  "일식라멘",
  "멕시칸",
  "떡/한과",
  "프랑스음식",
  "비건/채식/사찰",
  "기타",
] as const;

/** 대분류(표준 가맹점 업종코드) 9종. 정의서 순서 그대로 */
export const MAJOR_CATEGORIES = ["일반한식", "서양음식", "스넥", "중국음식", "일식회집", "주점", "칵테일바", "갈비전문점", "한정식"] as const;

/** 두 체계를 합친 43종. API 입력 검증은 이 목록 안의 값만 받는다 */
export const MENU_CATEGORIES: readonly string[] = [...AI_CATEGORIES, ...MAJOR_CATEGORIES];

/**
 * 분류 신뢰도가 낮은 매장을 묶은 값(정의서). 2026-11-26 역삼동 조회에서 백반/한정식, 기타한식, 기타일식, 호프 등이 섞여 왔다.
 * 메뉴를 고르는 데 뜻이 없어 칩, 자동완성, 홈 음식 조건 인식에서 뺀다. 입력 검증(43종)에는 남긴다.
 */
export const VAGUE_CATEGORY = "기타";

const MENU_SET = new Set<string>(MENU_CATEGORIES);

export function isMenuCategory(v: unknown): v is string {
  return typeof v === "string" && MENU_SET.has(v);
}
