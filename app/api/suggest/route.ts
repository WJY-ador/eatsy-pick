// 머리말 검색 자동완성의 장소(components/home/HeaderSearch.tsx, 규칙은 lib/suggest.ts). GET /api/suggest?q=<입력>
// 응답: { items: Suggestion[] }(역과 장소, 최대 8). 카카오 REST 키는 서버에서만 쓴다. 잇플(가게 데이터)은 부르지 않는다.
// 남용 방지: 입력 길이 하한과 상한, 같은 입력은 서버 캐시('use cache', 하루)와 브라우저 캐시(1시간)로 재사용한다.
// 카카오 호출이 실패하면 200 { items: [], failed: true }와 no-store로 답한다(화면은 기기 안 항목만 두고, 다음 입력에 다시 부른다).

import { suggestPlacesCached } from "@/components/area/cached";
import { SUGGEST_MIN, SUGGEST_QUERY_MAX } from "@/lib/suggest";

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.replace(/\s+/g, " ").trim();
  if (q.replace(/ /g, "").length < SUGGEST_MIN || q.length > SUGGEST_QUERY_MAX) {
    return Response.json({ error: `검색어는 ${SUGGEST_MIN}자 이상 ${SUGGEST_QUERY_MAX}자 이하로 입력해 주세요.` }, { status: 400 });
  }
  try {
    const items = await suggestPlacesCached(q);
    return Response.json({ items }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return Response.json({ items: [], failed: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
