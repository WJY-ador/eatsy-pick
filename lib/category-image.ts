// 카드 위 참고 이미지를 고르는 규칙. 메뉴 키와 사진 대응은 이 파일 한 곳에서만 한다.
// 고르는 순서(pickImage): 메뉴(이름 낱말이 업종과 맞을 때) → 업종 소분류 → 넓은 업종 → 중립 실사. 이름 낱말이 업종과 어긋나면 바로 중립 실사다.
// 같은 키는 언제나 같은 사진, 다른 키는 다른 사진이다. 사진이 없는 키는 만들지 않는다.
// 사진 선택에만 이름과 업종 값을 본다. 업종 배지와 추천 계산은 원래 업종 값을 쓰고, 이 모듈은 업종 값을 고쳐 쓰지 않는다.
// 사진은 메뉴나 업종을 떠올리게 하는 참고용이고 그 매장이나 판매 메뉴의 사진이 아니다.

import { displayName } from "./store-view";

export type ImageKey = (typeof KEYS)[number]["key"];

/** 이름 낱말이 업종 값과 어긋나는지 보는 기준. cafe는 카페 업종에서만, food는 카페가 아닌 업종에서만 맞고, any는 어디서나 맞다 */
type Fit = "cafe" | "food" | "any";

/** 넓은 업종. 이름의 메뉴 낱말이 업종과 맞는지(같은 넓은 업종에 드는지) 보는 데 쓴다 */
type Group = "한식" | "분식" | "일식" | "중식" | "양식" | "아시안" | "카페" | "주점" | "치킨";

// 순서가 우선순위다. 긴 낱말, 구체적인 메뉴를 앞에 둔다(닭갈비 → 갈비, 칼국수 → 국수, 순두부 → 두부, 순대국밥 → 국밥).
// 한 글자 낱말(회, 면, 빵, 전, 포, 바, 복, 닭, 콩)은 단독으로 쓰지 않는다. 회는 횟집, 물회처럼 앞뒤가 붙은 꼴만 본다.
// 이름이 비슷해도 메뉴가 다른 것은 떼어 둔다: 양갈비, 갈비탕은 갈비가 아니고, 막국수, 칼국수는 국수가 아니다.
// 맞는 사진을 못 구한 메뉴(낙지)는 키를 두지 않고 NO_PHOTO로 따로 본다.
// groups는 그 메뉴가 들 수 있는 넓은 업종이다. 업종 값의 넓은 업종과 하나도 겹치지 않으면 충돌로 본다.
// 2026-11-24 실측 표본(12개 동, 1,200곳)의 이름으로 오판을 걸렀다(우동점은 해운대구 우동 지점명, 회관, 국회, 상회는 회가 아니다).
const KEYS = [
  { key: "gamjatang", label: "감자탕", fit: "food", groups: ["한식"], words: /감자탕|뼈해장국|뼈다귀/ },
  { key: "dubu", label: "순두부, 두부", fit: "food", groups: ["한식"], words: /두부/ },
  { key: "seolleongtang", label: "설렁탕, 곰탕", fit: "food", groups: ["한식"], words: /설렁탕|곰탕/ },
  { key: "haejangguk", label: "해장국", fit: "food", groups: ["한식"], words: /해장/ },
  { key: "sundae", label: "순대, 순대국", fit: "food", groups: ["한식", "분식", "주점"], words: /순대|순댓국/ },
  { key: "gukbap", label: "국밥", fit: "food", groups: ["한식"], words: /국밥/ },
  { key: "naengmyeon", label: "냉면", fit: "food", groups: ["한식", "분식"], words: /냉면|면옥/ },
  { key: "pho", label: "쌀국수", fit: "food", groups: ["아시안"], words: /쌀국수/ },
  { key: "malatang", label: "마라탕", fit: "food", groups: ["중식"], words: /마라탕|마라샹궈|마라/ },
  { key: "dakgalbi", label: "닭갈비", fit: "food", groups: ["한식"], words: /닭갈비/ },
  { key: "yangkkochi", label: "양꼬치", fit: "food", groups: ["중식", "주점"], words: /양꼬치/ },
  { key: "gopchang", label: "곱창, 막창", fit: "food", groups: ["한식", "주점"], words: /곱창|막창|대창/ },
  { key: "jokbal", label: "족발", fit: "food", groups: ["한식", "주점"], words: /족발/ },
  { key: "bossam", label: "보쌈", fit: "food", groups: ["한식", "주점"], words: /보쌈/ },
  { key: "samgyeopsal", label: "삼겹살", fit: "food", groups: ["한식", "주점"], words: /삼겹|오겹/ },
  { key: "galbi", label: "갈비", fit: "food", groups: ["한식"], words: /(?<!양)갈비(?!탕)/ },
  { key: "jangeo", label: "장어", fit: "food", groups: ["한식", "일식"], words: /장어/ },
  { key: "chicken", label: "치킨", fit: "food", groups: ["치킨", "주점"], words: /치킨|통닭|닭강정/ },
  { key: "sushi", label: "초밥, 스시", fit: "food", groups: ["일식"], words: /초밥|스시|오마카세/ },
  { key: "hoe", label: "회", fit: "food", groups: ["일식", "한식", "주점"], words: /횟집|활어|물회|생선회|회센터|회뜨|바다회|(?:광어|우럭|뽈락|볼락|도다리|방어|숭어|전어|도미)회/ },
  { key: "donkatsu", label: "돈가스", fit: "food", groups: ["일식", "분식", "양식"], words: /돈가스|돈까스|돈카츠|카츠|카쯔|가츠/ },
  { key: "donburi", label: "텐동, 돈부리", fit: "food", groups: ["일식"], words: /텐동|돈부리|규동|사케동/ },
  { key: "ramen", label: "라멘", fit: "food", groups: ["일식"], words: /라멘/ },
  // 우동은 해운대구 우동의 지점명("해운대 우동점")과 구별한다
  { key: "udon", label: "우동", fit: "food", groups: ["일식", "분식"], words: /우동(?!\s*\d*\s*점)/ },
  { key: "soba", label: "소바", fit: "food", groups: ["일식"], words: /소바/ },
  { key: "chinese", label: "중화요리", fit: "food", groups: ["중식"], words: /짜장|짬뽕|중화|반점|탕수육/ },
  { key: "mandu", label: "만두", fit: "food", groups: ["중식", "한식", "분식"], words: /만두|딤섬|샤오롱바오/ },
  { key: "kalguksu", label: "칼국수", fit: "food", groups: ["한식", "분식"], words: /칼국수|칼제비/ },
  { key: "guksu", label: "국수", fit: "food", groups: ["한식", "분식"], words: /(?<![막칼쌀])국수/ },
  { key: "tteokbokki", label: "떡볶이", fit: "food", groups: ["분식"], words: /떡볶이|떡볶기/ },
  { key: "gimbap", label: "김밥", fit: "food", groups: ["분식"], words: /김밥/ },
  { key: "pizza", label: "피자", fit: "any", groups: ["양식", "카페", "주점"], words: /피자/ },
  { key: "pasta", label: "파스타", fit: "any", groups: ["양식", "카페"], words: /파스타/ },
  { key: "steak", label: "스테이크", fit: "food", groups: ["양식"], words: /스테이크/ },
  { key: "burger", label: "버거", fit: "any", groups: ["양식", "카페"], words: /버거/ },
  { key: "sandwich", label: "샌드위치", fit: "any", groups: ["양식", "카페", "분식"], words: /샌드위치/ },
  { key: "taco", label: "타코", fit: "any", groups: ["양식", "주점"], words: /타코(?!야)|부리또/ },
  { key: "salad", label: "샐러드, 포케", fit: "any", groups: ["양식", "카페"], words: /샐러드|포케/ },
  { key: "bakery", label: "베이커리", fit: "cafe", groups: ["카페"], words: /베이커리|제과|브레드|베이글|빵집|식빵/ },
  { key: "dessert", label: "케이크, 디저트", fit: "cafe", groups: ["카페"], words: /케이크|디저트|마카롱/ },
  { key: "coffee", label: "커피", fit: "cafe", groups: ["카페"], words: /커피|에스프레소|로스터/ },
  { key: "izakaya", label: "이자카야", fit: "food", groups: ["일식", "주점"], words: /이자카야|이자까야|사케/ },
  { key: "beer", label: "맥주", fit: "food", groups: ["주점", "치킨"], words: /맥주|호프|비어|브루어리/ },
  // 아래 키는 이름 낱말로 고르지 않는다. 업종 소분류(BY_CATEGORY), 넓은 업종(BY_GROUP), 중립 실사(NEUTRAL)로만 고른다
  { key: "gogi", label: "고기구이", fit: "food", groups: [], words: null },
  { key: "jjigae", label: "찌개", fit: "food", groups: [], words: null },
  { key: "hansik", label: "한정식", fit: "food", groups: [], words: null },
  { key: "brunch", label: "브런치", fit: "any", groups: [], words: null },
  { key: "bar", label: "바", fit: "food", groups: [], words: null },
  { key: "bunsik", label: "분식", fit: "food", groups: [], words: null },
  { key: "noodle", label: "국수, 면, 만두", fit: "food", groups: [], words: null },
  { key: "seafood", label: "해산물 구이, 찜", fit: "food", groups: [], words: null },
  { key: "bingsu", label: "빙수, 아이스크림", fit: "cafe", groups: [], words: null },
  { key: "asian", label: "아시안", fit: "food", groups: [], words: null },
  { key: "korean", label: "한식", fit: "food", groups: [], words: null },
  { key: "japanese", label: "일식", fit: "food", groups: [], words: null },
  { key: "pub", label: "주점", fit: "food", groups: [], words: null },
  { key: "neutral-table", label: "음식점 식탁", fit: "any", groups: [], words: null },
  { key: "neutral-room", label: "음식점 실내", fit: "any", groups: [], words: null },
] as const satisfies readonly { key: string; label: string; fit: Fit; groups: readonly Group[]; words: RegExp | null }[];

/**
 * 맞는 사진이 없는 메뉴 낱말. 이름에 있으면 이름의 메뉴 사진을 쓰지 않고 업종 소분류부터 내려간다(낙지 가게는 해산물 구이, 찜 사진).
 * 이름에 업종 값과 같은 다른 메뉴가 함께 있으면 그 사진을 쓴다.
 */
const NO_PHOTO = /낙지/;
const NO_PHOTO_GROUPS: readonly Group[] = ["한식", "주점"];

/** 업종 소분류 값 → 키. 그 업종을 대표하는 사진이 하나로 정해지는 값만 둔다. 여러 메뉴를 묶은 값(기타한식, 기타일식 등)은 넓은 업종으로 내려간다 */
const BY_CATEGORY: Record<string, ImageKey> = {
  고기구이: "gogi",
  "곱창전골/구이": "gopchang",
  "스시/초밥": "sushi",
  횟집: "hoe",
  일식돈가스: "donkatsu",
  일식라멘: "ramen",
  카페: "coffee",
  "브런치카페/샐러드": "brunch",
  "빵/도넛": "bakery",
  기타베이커리: "bakery",
  치킨: "chicken",
  "백반/한정식": "hansik",
  "찜/탕/찌개": "jjigae",
  김밥전문점: "gimbap",
  떡볶이전문점: "tteokbokki",
  "족발/보쌈": "jokbal",
  기타중식: "chinese",
  마라탕: "malatang",
  피자: "pizza",
  이탈리아음식: "pasta",
  버거: "burger",
  양꼬치: "yangkkochi",
  "샌드위치/토스트": "sandwich",
  멕시칸: "taco",
  호프: "beer",
  이자카야: "izakaya",
  "바(bar)": "bar",
  분식: "bunsik",
  "국수/면/만두": "noodle",
  "해산물구이/찜": "seafood",
  "아이스크림/요거트/빙수": "bingsu",
  아시안: "asian",
};

/** 업종 소분류 값 → 넓은 업종(맨 앞이 대표). 여기 없는 값은 GROUP_WORDS로 추정한다. 빈 배열은 음식점이 아닌 업종이다 */
const CATEGORY_GROUPS: Record<string, readonly Group[]> = {
  고기구이: ["한식", "주점"],
  "백반/한정식": ["한식"],
  "찜/탕/찌개": ["한식"],
  기타한식: ["한식"],
  "국수/면/만두": ["한식", "분식", "중식"],
  "해산물구이/찜": ["한식", "주점"],
  "곱창전골/구이": ["한식", "주점"],
  "족발/보쌈": ["한식", "주점"],
  "도시락/죽": ["한식", "분식"],
  "전/부침개": ["한식", "주점"],
  횟집: ["한식", "일식", "주점"],
  분식: ["분식"],
  김밥전문점: ["분식"],
  떡볶이전문점: ["분식"],
  기타일식: ["일식"],
  "스시/초밥": ["일식"],
  일식돈가스: ["일식"],
  일식라멘: ["일식"],
  이자카야: ["일식", "주점"],
  기타중식: ["중식"],
  마라탕: ["중식"],
  양꼬치: ["중식", "주점"],
  피자: ["양식"],
  버거: ["양식"],
  이탈리아음식: ["양식"],
  멕시칸: ["양식"],
  "샌드위치/토스트": ["양식", "카페", "분식"],
  아시안: ["아시안"],
  카페: ["카페"],
  "브런치카페/샐러드": ["카페", "양식"],
  "빵/도넛": ["카페"],
  기타베이커리: ["카페"],
  "아이스크림/요거트/빙수": ["카페"],
  체험카페: ["카페"],
  호프: ["주점", "치킨"],
  "바(bar)": ["주점"],
  기타주점: ["주점"],
  치킨: ["치킨", "주점"],
  // 실측(2026-11-24, 강릉, 은평, 영양 등)에서 주류판매점 값은 대부분 술집이었다
  주류판매점: ["주점"],
  // 여러 나라 음식과 커피, 주스가 섞인 값(기타외국식)과 뷔페, 푸드코트는 넓은 업종을 정하지 않는다(판정하지 않고 사진은 중립 실사)
  기타의류: [],
};

/** 표에 없는 업종 값의 넓은 업종 추정. 앞에서부터 처음 맞는 것 하나 */
const GROUP_WORDS: [RegExp, Group][] = [
  [/카페|커피|베이커리|빵|도넛|디저트|아이스크림|빙수|제과|떡/, "카페"],
  [/주점|호프|포차|와인|바\(bar\)/, "주점"],
  [/치킨/, "치킨"],
  [/일식|초밥|스시|라멘|돈가스|우동/, "일식"],
  [/중식|중국|마라/, "중식"],
  [/양식|이탈리|피자|버거|멕시|스테이크|패밀리레스토랑/, "양식"],
  [/아시안|베트남|태국|인도/, "아시안"],
  [/분식|김밥|떡볶이/, "분식"],
  [/한식|백반|한정식|국밥|탕|찌개|고기|구이|냉면|죽|해산물/, "한식"],
];

/** 넓은 업종 → 키. 중식, 카페는 그 넓은 업종의 대표 소분류(기타중식, 카페) 사진을 쓴다. 사진이 없는 넓은 업종(양식, 치킨)은 중립 실사로 내려간다 */
const BY_GROUP: Partial<Record<Group, ImageKey>> = {
  한식: "korean",
  일식: "japanese",
  분식: "bunsik",
  중식: "chinese",
  카페: "coffee",
  아시안: "asian",
  주점: "pub",
};

/** 중립 실사. 특정 메뉴를 떠올리게 하지 않는다. 앞이 기본, 뒤는 앞 파일을 못 불러올 때 쓴다 */
export const NEUTRAL_KEYS = ["neutral-table", "neutral-room"] as const satisfies readonly ImageKey[];

/** 음식점이 아닌 업종 값이 그 밖에 들어올 때 걸러 내는 낱말 */
const NON_FOOD = /의류|잡화|편의점|마트|약국|병원|미용|숙박|주유/;

/** 카페 갈래의 업종 값. 나머지 값은 카페가 아닌 업종으로 본다 */
const CAFE_CATEGORIES = new Set(["카페", "브런치카페/샐러드", "빵/도넛", "기타베이커리", "아이스크림/요거트/빙수", "체험카페"]);

/** 비교용 정규화: 앞뒤와 안쪽 공백을 없앤다 */
const norm = (v: string) => v.replace(/\s+/g, "");

const CATEGORY_KEY = new Map<string, ImageKey>(Object.entries(BY_CATEGORY).map(([c, k]) => [norm(c), k]));
const CATEGORY_GROUP = new Map<string, readonly Group[]>(Object.entries(CATEGORY_GROUPS).map(([c, g]) => [norm(c), g]));
const CAFE = new Set([...CAFE_CATEGORIES].map(norm));
const FIT = new Map<ImageKey, Fit>(KEYS.map((k) => [k.key, k.fit]));
const KEY_GROUPS = new Map<ImageKey, readonly Group[]>(KEYS.map((k) => [k.key, k.groups]));

/** 이름 낱말이 업종 값과 명백히 어긋나는가(카페 업종에 삼겹살, 고기구이 업종에 베이커리). 빈 업종 값은 판정하지 않는다 */
function clashes(key: ImageKey, category: string): boolean {
  const fit = FIT.get(key);
  if (!category || !fit || fit === "any") return false;
  return fit === "cafe" ? !CAFE.has(category) : CAFE.has(category);
}

/** 업종 값의 넓은 업종. null은 모름(판정하지 않음), 빈 배열은 음식점이 아닌 업종 */
function groupsOf(category: string): readonly Group[] | null {
  if (!category) return null;
  const known = CATEGORY_GROUP.get(category);
  if (known) return known;
  if (NON_FOOD.test(category)) return [];
  const hit = GROUP_WORDS.find(([re]) => re.test(category));
  return hit ? [hit[1]] : null;
}

/** 메뉴 키가 업종 값과 맞는가: 카페 갈래가 어긋나지 않고, 넓은 업종이 하나라도 겹친다. 넓은 업종을 모르면 카페 갈래만 본다 */
function fitsCategory(key: ImageKey, category: string, groups: readonly Group[] | null): boolean {
  if (clashes(key, category)) return false;
  if (groups === null) return true;
  const own = KEY_GROUPS.get(key) ?? [];
  return own.some((g) => groups.includes(g));
}

/** 지점명을 뗀다: 괄호 안의 "…점", 마지막 낱말이 "…점"(전문점은 남긴다). 지점명의 동 이름(우동, 회현 등)이 메뉴로 읽히지 않게 */
function stripBranch(name: string): string {
  const noParen = name.replace(/\([^)]*점\)/g, " ");
  const parts = noParen.trim().split(/\s+/);
  if (parts.length > 1 && /점$/.test(parts[parts.length - 1]) && !/전문점$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

/** 이름에서 찾은 메뉴 키(우선순위 순서) */
function nameKeys(n: string): ImageKey[] {
  return KEYS.filter((k) => k.words !== null && k.words.test(n)).map((k) => k.key);
}

/**
 * 이름 낱말과 업종 소분류만으로 고른 키(넓은 업종, 중립 실사 단계 전). 이름 낱말 → 업종 값 → null 순서다.
 * 이름에 메뉴가 여럿이면 업종 값과 같은 키를 앞세운다. 이름 낱말이 카페 갈래와 어긋나거나 사진 없는 메뉴 낱말(NO_PHOTO)만 있으면 null이다.
 * 카드는 pickImage를 쓴다. 이 함수는 메뉴 단위 규칙의 기준으로 남긴다.
 */
export function imageKeyOf({ name, category }: { name?: string | null; category?: string | null }): ImageKey | null {
  const cat = category ? norm(category) : "";
  const byCategory = cat ? (CATEGORY_KEY.get(cat) ?? null) : null;
  const n = name ? stripBranch(displayName(name)) : "";
  const found = n ? nameKeys(n) : [];
  const agrees = byCategory !== null && found.includes(byCategory);
  if (NO_PHOTO.test(n)) return agrees ? byCategory : null;
  if (found.length === 0) return byCategory;
  // 이름에 메뉴가 둘 이상이면 업종 값과 같은 쪽을 고른다
  const byName = agrees ? byCategory : found[0];
  return clashes(byName, cat) ? null : byName;
}

/** 어느 단계에서 고른 사진인가. menu: 이름의 메뉴, sub: 업종 소분류, broad: 넓은 업종, neutral: 중립 실사 */
export type ImageTier = "menu" | "sub" | "broad" | "neutral";
export type ImagePick = { key: ImageKey; tier: ImageTier };

/**
 * 카드 이미지. 언제나 사진 하나를 돌려준다.
 * 1. 이름의 메뉴 낱말이 업종과 맞으면(같은 넓은 업종) 그 메뉴 사진. 맞는 메뉴가 여럿이면 업종 소분류와 같은 것, 아니면 앞의 것.
 * 2. 이름에 메뉴 낱말이 있는데 하나도 업종과 맞지 않으면 충돌이다. 중립 실사.
 * 3. 메뉴 낱말이 없거나 사진 없는 메뉴(NO_PHOTO)뿐이면 업종 소분류 사진, 없으면 넓은 업종 사진, 없으면 중립 실사.
 * 음식점이 아닌 업종 값과 넓은 업종을 정하지 않은 값(기타외국식, 뷔페)은 중립 실사다.
 */
export function pickImage({ name, category }: { name?: string | null; category?: string | null }): ImagePick {
  const neutral: ImagePick = { key: NEUTRAL_KEYS[0], tier: "neutral" };
  const cat = category ? norm(category) : "";
  const groups = groupsOf(cat);
  if (groups !== null && groups.length === 0) return neutral;
  const byCategory = cat ? (CATEGORY_KEY.get(cat) ?? null) : null;
  const n = name ? stripBranch(displayName(name)) : "";
  const found = n ? nameKeys(n) : [];
  const fitting = found.filter((k) => fitsCategory(k, cat, groups));
  if (fitting.length > 0) return { key: byCategory !== null && fitting.includes(byCategory) ? byCategory : fitting[0], tier: "menu" };
  if (found.length > 0) return neutral;
  if (NO_PHOTO.test(n) && groups !== null && !NO_PHOTO_GROUPS.some((g) => groups.includes(g))) return neutral;
  if (byCategory !== null) return { key: byCategory, tier: "sub" };
  const broad = groups && groups.length > 0 ? BY_GROUP[groups[0]] : undefined;
  return broad ? { key: broad, tier: "broad" } : neutral;
}

export type CategoryImageAsset = { src: string; srcSet: string; width: number; height: number; label: string; alt: string };

const image = (key: ImageKey, label: string): CategoryImageAsset => ({
  src: `/img/category/${key}-640.webp`,
  srcSet: `/img/category/${key}-640.webp 640w, /img/category/${key}-960.webp 960w`,
  width: 640,
  height: 360,
  label,
  alt: (NEUTRAL_KEYS as readonly string[]).includes(key) ? `${label} 참고 이미지` : `${label} 업종 참고 이미지`,
});

/** 키마다 사진 한 장. 파일 이름이 키라서 두 키가 한 파일을 쓰지 않는다 */
export const CATEGORY_IMAGES = Object.fromEntries(KEYS.map((k) => [k.key, image(k.key, k.label)])) as Record<ImageKey, CategoryImageAsset>;
