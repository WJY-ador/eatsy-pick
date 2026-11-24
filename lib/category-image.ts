// 카드 위 참고 이미지를 고르는 규칙. 메뉴 키와 사진 대응은 이 파일 한 곳에서만 한다.
// 1순위는 가게 이름(화면 표시 이름)에 든 메뉴 낱말, 2순위는 BC카드 업종 값(Store.category = merTpbuzNm)이다. 둘 다 없으면 null(플레이스홀더).
// 같은 키는 언제나 같은 사진, 다른 키는 다른 사진이다. 사진이 없는 키는 만들지 않는다.
// 사진 선택에만 이름을 본다. 업종 배지와 추천 계산은 원래 업종 값을 쓰고, 이 모듈은 업종 값을 고쳐 쓰지 않는다.
// 사진은 메뉴를 떠올리게 하는 참고용이고 그 매장이나 판매 메뉴의 사진이 아니다.

import { displayName } from "./store-view";

export type ImageKey = (typeof KEYS)[number]["key"];

/** 이름 낱말이 업종 값과 어긋나는지 보는 기준. cafe는 카페 업종에서만, food는 카페가 아닌 업종에서만 맞고, any는 어디서나 맞다 */
type Fit = "cafe" | "food" | "any";

// 순서가 우선순위다. 긴 낱말, 구체적인 메뉴를 앞에 둔다(닭갈비 → 갈비, 칼국수 → 국수, 순두부 → 두부).
// 한 글자 낱말(회, 면, 빵, 전, 포, 바, 복, 닭, 콩)은 단독으로 쓰지 않는다. 회는 횟집, 물회처럼 앞뒤가 붙은 꼴만 본다.
// 이름이 비슷해도 메뉴가 다른 것은 떼어 둔다: 양갈비, 갈비탕은 갈비가 아니고, 막국수, 칼국수는 국수가 아니다.
// 맞는 사진을 못 구한 메뉴(순대국, 칼국수, 낙지)는 키를 두지 않고 NO_PHOTO로 따로 본다.
// 2026-11-24 실측 표본(12개 동, 1,200곳)의 이름으로 오판을 걸렀다(우동점은 해운대구 우동 지점명, 회관, 국회, 상회는 회가 아니다).
const KEYS = [
  { key: "gamjatang", label: "감자탕", fit: "food", words: /감자탕|뼈해장국|뼈다귀/ },
  { key: "dubu", label: "순두부, 두부", fit: "food", words: /두부/ },
  { key: "seolleongtang", label: "설렁탕, 곰탕", fit: "food", words: /설렁탕|곰탕/ },
  { key: "haejangguk", label: "해장국", fit: "food", words: /해장/ },
  { key: "gukbap", label: "국밥", fit: "food", words: /국밥/ },
  { key: "naengmyeon", label: "냉면", fit: "food", words: /냉면|면옥/ },
  { key: "pho", label: "쌀국수", fit: "food", words: /쌀국수/ },
  { key: "malatang", label: "마라탕", fit: "food", words: /마라탕|마라샹궈|마라/ },
  { key: "dakgalbi", label: "닭갈비", fit: "food", words: /닭갈비/ },
  { key: "yangkkochi", label: "양꼬치", fit: "food", words: /양꼬치/ },
  { key: "gopchang", label: "곱창, 막창", fit: "food", words: /곱창|막창|대창/ },
  { key: "jokbal", label: "족발", fit: "food", words: /족발/ },
  { key: "bossam", label: "보쌈", fit: "food", words: /보쌈/ },
  { key: "samgyeopsal", label: "삼겹살", fit: "food", words: /삼겹|오겹/ },
  { key: "galbi", label: "갈비", fit: "food", words: /(?<!양)갈비(?!탕)/ },
  { key: "jangeo", label: "장어", fit: "food", words: /장어/ },
  { key: "chicken", label: "치킨", fit: "food", words: /치킨|통닭|닭강정/ },
  { key: "sushi", label: "초밥, 스시", fit: "food", words: /초밥|스시|오마카세/ },
  { key: "hoe", label: "회", fit: "food", words: /횟집|활어|물회|생선회|회센터|회뜨|바다회|(?:광어|우럭|뽈락|볼락|도다리|방어|숭어|전어|도미)회/ },
  { key: "donkatsu", label: "돈가스", fit: "food", words: /돈가스|돈까스|돈카츠|카츠|카쯔|가츠/ },
  { key: "donburi", label: "텐동, 돈부리", fit: "food", words: /텐동|돈부리|규동|사케동/ },
  { key: "ramen", label: "라멘", fit: "food", words: /라멘/ },
  // 우동은 해운대구 우동의 지점명("해운대 우동점")과 구별한다
  { key: "udon", label: "우동", fit: "food", words: /우동(?!\s*\d*\s*점)/ },
  { key: "soba", label: "소바", fit: "food", words: /소바/ },
  { key: "chinese", label: "중화요리", fit: "food", words: /짜장|짬뽕|중화|반점|탕수육/ },
  { key: "mandu", label: "만두", fit: "food", words: /만두|딤섬|샤오롱바오/ },
  { key: "guksu", label: "국수", fit: "food", words: /(?<![막칼쌀])국수/ },
  { key: "tteokbokki", label: "떡볶이", fit: "food", words: /떡볶이|떡볶기/ },
  { key: "gimbap", label: "김밥", fit: "food", words: /김밥/ },
  { key: "pizza", label: "피자", fit: "any", words: /피자/ },
  { key: "pasta", label: "파스타", fit: "any", words: /파스타/ },
  { key: "steak", label: "스테이크", fit: "food", words: /스테이크/ },
  { key: "burger", label: "버거", fit: "any", words: /버거/ },
  { key: "sandwich", label: "샌드위치", fit: "any", words: /샌드위치/ },
  { key: "taco", label: "타코", fit: "any", words: /타코(?!야)|부리또/ },
  { key: "salad", label: "샐러드, 포케", fit: "any", words: /샐러드|포케/ },
  { key: "bakery", label: "베이커리", fit: "cafe", words: /베이커리|제과|브레드|베이글|빵집|식빵/ },
  { key: "dessert", label: "케이크, 디저트", fit: "cafe", words: /케이크|디저트|마카롱/ },
  { key: "coffee", label: "커피", fit: "cafe", words: /커피|에스프레소|로스터/ },
  { key: "izakaya", label: "이자카야", fit: "food", words: /이자카야|이자까야|사케/ },
  { key: "beer", label: "맥주", fit: "food", words: /맥주|호프|비어|브루어리/ },
  // 아래 키는 이름 낱말로 고르지 않고 업종 값으로만 고른다
  { key: "gogi", label: "고기구이", fit: "food", words: null },
  { key: "jjigae", label: "찌개", fit: "food", words: null },
  { key: "hansik", label: "한정식", fit: "food", words: null },
  { key: "brunch", label: "브런치", fit: "any", words: null },
  { key: "bar", label: "바", fit: "food", words: null },
] as const satisfies readonly { key: string; label: string; fit: Fit; words: RegExp | null }[];

/**
 * 맞는 사진이 없는 메뉴 낱말. 이름에 있으면 업종 값의 사진으로 대신하지 않고 플레이스홀더로 둔다(순대국 가게가 찌개 사진을 받지 않게).
 * 이름에 업종 값과 같은 다른 메뉴가 함께 있을 때만 그 사진을 쓴다(소곱창순대국은 곱창, 족발순대국은 족발).
 */
const NO_PHOTO = /순대|순댓국|칼국수|낙지/;

/** 업종 값 → 키. 그 업종을 대표하는 메뉴가 하나로 정해지는 값만 둔다. 여러 메뉴를 묶은 값(기타한식, 국수/면/만두 등)은 null */
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
};

/** 카페 갈래의 업종 값. 나머지 값은 카페가 아닌 업종으로 본다 */
const CAFE_CATEGORIES = new Set(["카페", "브런치카페/샐러드", "빵/도넛", "기타베이커리", "아이스크림/요거트/빙수", "체험카페"]);

/** 비교용 정규화: 앞뒤와 안쪽 공백을 없앤다 */
const norm = (v: string) => v.replace(/\s+/g, "");

const CATEGORY_KEY = new Map<string, ImageKey>(Object.entries(BY_CATEGORY).map(([c, k]) => [norm(c), k]));
const CAFE = new Set([...CAFE_CATEGORIES].map(norm));
const FIT = new Map<ImageKey, Fit>(KEYS.map((k) => [k.key, k.fit]));

/** 이름 낱말이 업종 값과 명백히 어긋나는가(카페 업종에 삼겹살, 고기구이 업종에 베이커리). 빈 업종 값은 판정하지 않는다 */
function clashes(key: ImageKey, category: string): boolean {
  const fit = FIT.get(key);
  if (!category || !fit || fit === "any") return false;
  return fit === "cafe" ? !CAFE.has(category) : CAFE.has(category);
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
 * 카드 이미지 키. 이름 낱말 → 업종 값 → null 순서로 고른다. 이름에 메뉴가 여럿이면 업종 값과 같은 키를 앞세운다.
 * 이름 낱말이 업종 값과 명백히 어긋나면 플레이스홀더로 둔다. 사진이 없는 메뉴 낱말(NO_PHOTO)이 있어도 플레이스홀더로 둔다.
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

export type CategoryImageAsset = { src: string; srcSet: string; width: number; height: number; label: string };

const image = (key: ImageKey, label: string): CategoryImageAsset => ({
  src: `/img/category/${key}-640.webp`,
  srcSet: `/img/category/${key}-640.webp 640w, /img/category/${key}-960.webp 960w`,
  width: 640,
  height: 360,
  label,
});

/** 키마다 사진 한 장. 파일 이름이 키라서 두 키가 한 파일을 쓰지 않는다 */
export const CATEGORY_IMAGES = Object.fromEntries(KEYS.map((k) => [k.key, image(k.key, k.label)])) as Record<ImageKey, CategoryImageAsset>;
