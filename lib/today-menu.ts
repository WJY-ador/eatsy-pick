// 오늘 뭐먹지(components/home/TodayMenu.tsx, 홈 우측 하단 웹챗)의 규칙: 분류 칩, 입력 자동완성, 조회 주소, 결과 고르기.
// 분류는 잇플 업종 분류표(lib/food.ts MENU_CATEGORIES 43종) 그대로 쓴다. 조회는 GET /api/menu-stores(app/api/menu-stores/route.ts).
// 대화 상태는 기기 메모리에만 둔다. 서버와 분석 도구로 보내지 않는다(조회 주소에는 분류와 지역만 담는다).
// 이 모듈은 브라우저와 서버 라우트가 같이 쓴다. Next 전용 API를 import하지 않는다.

import { AI_CATEGORIES, FOOD_WORDS, MENU_CATEGORIES, VAGUE_CATEGORY, foodCategory } from "./food";
import { type HomeScope, isAddressLike } from "./home-params";
import type { Store } from "./stores";

/** 칩: 소분류 33종(기타 제외), 정의서 순서. 대분류는 소분류와 겹쳐 칩으로 띄우지 않고 입력으로만 찾는다 */
export const MENU_CHIPS: string[] = AI_CATEGORIES.filter((c) => c !== VAGUE_CATEGORY);
/** 입력으로 찾는 분류: 43종에서 기타를 뺀 42종 */
const SEARCHABLE: string[] = MENU_CATEGORIES.filter((c) => c !== VAGUE_CATEGORY);
/** 입력칸 글자 수 상한 */
export const INPUT_MAX = 20;
/** 자동완성 칩 수 상한 */
export const MATCH_MAX = 8;
/** 한 번에 보이는 카드 수 */
export const CARD_COUNT = 3;
/** 조회 주소에 담는 동네(loc) 수 상한. 홈 상권 조회와 같은 3건 */
export const MENU_LOC_MAX = 3;

/** 결과 카드와 필터에 쓰는 필드만 */
export type MenuStore = Pick<Store, "id" | "name" | "category" | "sigungu" | "merUrl" | "ccgRank" | "local" | "hoesik" | "franchise">;

export function toMenuStore(s: Store): MenuStore {
  return { id: s.id, name: s.name, category: s.category, sigungu: s.sigungu, merUrl: s.merUrl, ccgRank: s.ccgRank, local: s.local, hoesik: s.hoesik, franchise: s.franchise };
}

function compact(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 대응표 업종이 42종 안일 때만 그 분류(회 → 횟집처럼 분류표 밖이면 null) */
function wordCategory(word: string): string | null {
  const cat = foodCategory(word);
  return cat && SEARCHABLE.includes(cat) ? cat : null;
}

/**
 * 입력에 맞는 분류(최대 MATCH_MAX). 순서: 이름 정확 일치, 이름이나 슬래시 조각의 앞부분 일치, 이름 중간 일치,
 * 그다음 lib/food.ts 음식 표현(국밥 → 찜/탕/찌개, 삼겹 → 고기구이, 돼지국밥 → 찜/탕/찌개). 같은 순위는 정의서 순서.
 */
export function matchMenu(input: string): string[] {
  const q = compact(input);
  if (!q) return [];
  const rank = new Map<string, number>();
  const put = (cat: string, r: number) => {
    const prev = rank.get(cat);
    if (prev === undefined || r < prev) rank.set(cat, r);
  };
  for (const c of SEARCHABLE) {
    const k = compact(c);
    if (k === q) put(c, 0);
    else if (k.startsWith(q) || c.split("/").some((p) => p.startsWith(q))) put(c, 1);
    else if (k.includes(q)) put(c, 2);
  }
  for (const w of FOOD_WORDS) {
    const cat = wordCategory(w);
    if (!cat) continue;
    if (w === q) put(cat, 1);
    else if (w.startsWith(q) || q.includes(w)) put(cat, 3);
  }
  return SEARCHABLE.filter((c) => rank.has(c))
    .sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number))
    .slice(0, MATCH_MAX);
}

/** 입력이 분류 하나로 정해지면 그 분류(이름과 같거나, 대응표 음식 표현이거나, 맞는 분류가 하나뿐). 아니면 null */
export function resolveMenu(input: string): string | null {
  const q = compact(input);
  const exact = SEARCHABLE.find((c) => compact(c) === q);
  if (exact) return exact;
  const word = wordCategory(q);
  if (word) return word;
  const m = matchMenu(input);
  return m.length === 1 ? m[0] : null;
}

/**
 * 조회 주소. 프리셋 상권은 slug, 그 밖은 홈이 실제로 조회한 주소 범위(dataset.queries) 중 주소 꼴인 것(최대 3).
 * 역, 장소 이름의 장소 검색이 실패하면 홈은 입력 원문(해운대역)으로 조회한다. 그 값은 라우트가 받지 않으므로(카카오를 부르지 않는다) 빼고,
 * 남는 범위가 없으면 null(화면은 버튼을 그리지 않는다).
 */
export function menuStoresUrl(category: string, scope: HomeScope, queries: string[]): string | null {
  const p = new URLSearchParams({ cat: category });
  if (scope.kind === "area") p.set("area", scope.slug);
  else {
    const locs = (queries.length ? queries : [scope.loc]).filter((l) => isAddressLike(l)).slice(0, MENU_LOC_MAX);
    if (locs.length === 0) return null;
    for (const l of locs) p.append("loc", l);
  }
  return `/api/menu-stores?${p.toString()}`;
}

/** 지금 홈 지역으로 조회할 수 있는가(버튼을 그릴지) */
export function menuReady(scope: HomeScope, queries: string[]): boolean {
  return menuStoresUrl(MENU_CHIPS[0], scope, queries) !== null;
}

export type MenuFilter = "local" | "hoesik" | null;

/** 받아 둔 가게에서 프랜차이즈 제외와 표시 조건을 건다. 순서는 받은 순서(시군구 매출 상위 순) 그대로 */
export function filterMenuStores(stores: MenuStore[], o: { exclude: boolean; only?: MenuFilter }): MenuStore[] {
  return stores.filter((s) => !(o.exclude && s.franchise) && (o.only === "local" ? s.local === true : o.only === "hoesik" ? s.hoesik === true : true));
}

/** 브라우저 메모리 캐시(세션 동안). 진행 중인 요청도 담는다. 실패는 남기지 않는다 */
const cache = new Map<string, Promise<MenuStore[]>>();

export function loadMenuStores(url: string): Promise<MenuStore[]> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = fetch(url, { headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) throw new Error(`menu-stores ${res.status}`);
      const body = (await res.json()) as { stores?: unknown };
      if (!Array.isArray(body.stores)) throw new Error("menu-stores body");
      return body.stores as MenuStore[];
    })
    .catch((e: unknown) => {
      cache.delete(url);
      throw e;
    });
  cache.set(url, p);
  return p;
}
