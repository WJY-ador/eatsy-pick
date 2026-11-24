// 지역 후보 검색(상권 랭킹의 지역 추가, 지역 변경). GET /api/area-search?q=<지역>
// 응답: { candidates: AreaCandidate[] }. 카카오 REST 키는 서버에서만 쓴다. 입력은 항상 지역으로 읽는다.
// 남용 방지: 입력 길이 상한(AREA_QUERY_MAX), 같은 검색어는 서버 캐시('use cache', 하루)와 브라우저 캐시(1시간)로 재사용한다.

import { areaCandidatesCached } from "@/components/area/cached";
import { AREA_QUERY_MAX } from "@/lib/my-areas";

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.replace(/\s+/g, " ").trim();
  if (q.length < 1 || q.length > AREA_QUERY_MAX) {
    return Response.json({ error: `지역 이름은 1자 이상 ${AREA_QUERY_MAX}자 이하로 입력해 주세요.` }, { status: 400 });
  }
  try {
    const candidates = await areaCandidatesCached(q);
    return Response.json({ candidates }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return Response.json({ error: "지역 검색이 잠시 실패했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 502 });
  }
}
