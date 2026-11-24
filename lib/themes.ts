// 홈 테마 칩과 큐레이션 섹션. 서버와 클라이언트가 같이 쓰는 순수 함수다(Next 전용 API를 import하지 않는다).
// 판정은 응답 필드만 쓴다. 필드가 비었으면 그 테마에 넣지 않는다(미확인).

import { customerLabel } from "./labels";
import type { Store } from "./stores";

export type ThemeId = "all" | "top1" | "local" | "hoesik" | "y2030";

/** 주소 t가 받는 테마 전부와 화면 라벨. 옛 공유 링크(t=y2030)도 여기서 읽고, 제목과 적용 표시가 라벨을 쓴다 */
export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "top1", label: "매출 상위 1%" },
  { id: "local", label: "동네맛집" },
  { id: "hoesik", label: "회식 적합" },
  { id: "y2030", label: "2030 주 고객층" },
];

/** 홈 테마 줄에 그리는 칩(순서 그대로). y2030은 칩에서 뺐다. 연령대는 상권 분석의 주 고객층 차트에서 본다 */
export const HOME_THEME_CHIPS: { id: ThemeId; label: string }[] = THEMES.filter((t) => t.id !== "y2030");

/** 칩에 없는 테마(옛 링크로 들어온 y2030)인가. 이때 테마 줄은 적용 표시와 해제 버튼을 보인다 */
export function isHiddenTheme(theme: ThemeId): boolean {
  return !HOME_THEME_CHIPS.some((t) => t.id === theme);
}

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEME_IDS.has(v);
}

/** 원본 rk01이 20대 또는 30대인가. 옛 스냅샷(customer1 없음)과 빈 값은 false */
function isY2030(customer1: string | null | undefined): boolean {
  return typeof customer1 === "string" && /^(20|30)대/.test(customer1);
}

export function matchTheme(store: Pick<Store, "ccgRank" | "local" | "hoesik" | "customer1">, theme: ThemeId): boolean {
  switch (theme) {
    case "top1":
      return typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank) && store.ccgRank <= 1;
    case "local":
      return store.local === true;
    case "hoesik":
      return store.hoesik === true;
    case "y2030":
      return isY2030(store.customer1);
    default:
      return true;
  }
}

/** 전체 테마에서 보여 주는 큐레이션 섹션(순서 그대로) */
export const CURATIONS: { theme: "top1" | "local" | "hoesik"; title: (region: string) => string; sub: string }[] = [
  { theme: "top1", title: (region) => `${region} 매출 상위 1%`, sub: "최근 1개월 BC카드 결제 매출 기준" },
  { theme: "local", title: () => "동네맛집", sub: "BC카드 동네맛집 표시가 있는 매장" },
  { theme: "hoesik", title: () => "회식 적합", sub: "BC카드 회식 적합 표시가 있는 매장" },
];

export const Y2030_SUB = "주 결제 고객층 1위가 20대 또는 30대인 매장";

/** 원본 rk01을 화면 라벨로("30대남성" → "30대 남성"). 없거나 옛 스냅샷이면 null */
export function customer1Label(store: Pick<Store, "customer1">): string | null {
  const c = store.customer1;
  return typeof c === "string" && c.trim() !== "" ? customerLabel(c) : null;
}
