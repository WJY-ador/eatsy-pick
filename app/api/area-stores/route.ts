// 홈 지도를 옮긴 동네의 가게(옅은 핀, lib/area-search.ts 머리 주석). GET /api/area-stores?area=<프리셋 slug> 또는 ?loc=<주소 꼴 지역>
// 응답: { stores: PanStore[] }(좌표 있는 매장만, 핀과 테마 판정과 동 이동에 쓰는 필드만). 좌표는 받지 않는다(역지오코딩은 브라우저가 한다).
// 입력: 프리셋 slug이거나 주소 꼴 loc(강남구 역삼동, 서울 송파구, 강릉시)만 받는다. 역, 장소 이름은 서버가 카카오 장소 검색을 부르므로 막는다.
// 조회는 홈과 같은 loadArea라 잇플 fetch 캐시(21600초)를 홈 페이지와 같이 쓴다. 브라우저 1시간, CDN 6시간 캐시.

import { areaBySlug } from "@/lib/areas";
import { toPanStore } from "@/lib/area-search";
import { isAddressLike } from "@/lib/home-params";
import { cleanLoc, loadArea } from "@/lib/stores";

export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const area = sp.get("area");
  const loc = cleanLoc(sp.get("loc"));
  const input = area !== null ? (areaBySlug(area) ? { area } : null) : loc && isAddressLike(loc) ? { loc } : null;
  if (!input) return Response.json({ error: "지역 값이 올바르지 않습니다." }, { status: 400 });
  try {
    const dataset = await loadArea(input);
    const stores = dataset.stores.filter((s) => s.lat !== null && s.lng !== null).map(toPanStore);
    return Response.json({ stores }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "가게를 불러오지 못했습니다." }, { status: 502 });
  }
}
