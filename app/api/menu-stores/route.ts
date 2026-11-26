// 오늘 뭐먹지(components/home/TodayMenu.tsx)의 업종 조회. GET /api/menu-stores?cat=<분류>&area=<프리셋 slug> 또는 ?cat=<분류>&loc=<주소 꼴>(최대 3)
// 응답: { stores: MenuStore[], failed }(lib/today-menu.ts, 카드와 필터에 쓰는 필드만, 시군구 매출 상위 순). 동네맛집만, 회식 적합만, 프랜차이즈 제외는 화면이 거른다.
// 입력 검증: cat은 잇플 업종 분류표 43종(lib/food.ts MENU_CATEGORIES) 안의 값만. 지역은 프리셋 slug이거나, 홈이 실제로 조회한 주소 범위(dataset.queries)라
// 모든 loc가 주소 꼴(isAddressLike)이어야 한다. 역, 장소 이름은 받지 않는다(이 라우트는 카카오를 부르지 않는다).
// 조회는 홈 음식 조건과 같은 loadArea(category)라 잇플 fetch 캐시(21600초)를 홈과 같이 쓴다. 프록시 호출은 요청마다 최대 3건. 브라우저 1시간, CDN 6시간 캐시.

import { areaBySlug } from "@/lib/areas";
import { isMenuCategory } from "@/lib/food";
import { isAddressLike } from "@/lib/home-params";
import { type AreaDataset, cleanLoc, dedupeStores, loadArea } from "@/lib/stores";
import { MENU_LOC_MAX, toMenuStore } from "@/lib/today-menu";

function bad(): Response {
  return Response.json({ error: "분류나 지역 값이 올바르지 않습니다." }, { status: 400 });
}

export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const category = sp.get("cat");
  if (!isMenuCategory(category)) return bad();
  const area = sp.get("area");
  const rawLocs = sp.getAll("loc");
  let inputs: { area?: string; loc?: string; category: string }[];
  if (area !== null) {
    if (rawLocs.length > 0 || !areaBySlug(area)) return bad();
    inputs = [{ area, category }];
  } else {
    const locs = [...new Set(rawLocs.map((l) => cleanLoc(l)))];
    if (locs.length === 0 || locs.length > MENU_LOC_MAX || locs.some((l) => !l || !isAddressLike(l))) return bad();
    inputs = (locs as string[]).map((loc) => ({ loc, category }));
  }
  const settled = await Promise.allSettled(inputs.map((i) => loadArea(i)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<AreaDataset> => s.status === "fulfilled").map((s) => s.value);
  if (ok.length === 0) return Response.json({ error: "가게를 불러오지 못했습니다." }, { status: 502 });
  const failed = settled.length - ok.length + ok.reduce((n, d) => n + d.failed, 0);
  const stores = dedupeStores(ok.flatMap((d) => d.stores)).map(toMenuStore);
  // 일부 호출이 실패한 응답은 오래 두지 않는다(다음 요청에 다시 부른다).
  const cacheControl = failed > 0 ? "no-store" : "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400";
  return Response.json({ stores, failed }, { headers: { "Cache-Control": cacheControl } });
}
