/**
 * 홍보 링크의 UTM 쿼리(utm_source, utm_medium, utm_campaign, utm_content, utm_term처럼 utm_로 시작하는 쿼리) 보존.
 * GA4는 세션 첫 페이지 주소의 UTM으로 유입을 판단한다. 그래서 앱이 도착 주소를 스스로 정리할 때(replaceState, 서버 redirect,
 * 사용자 동작 없이 하는 router 이동) 이 쿼리를 지우지 않고 받은 순서대로 뒤에 붙인다. 사용자가 누른 앱 안 이동에는 붙이지 않는다.
 * 주소의 UTM은 원문 조각(인코딩 포함) 그대로 옮긴다. 지금 주소에 UTM이 없으면 결과는 이 파일을 쓰기 전과 글자까지 같다.
 */

type RawParams = Record<string, string | string[] | undefined>;

function isUtm(piece: string): boolean {
  return piece.startsWith("utm_");
}

/** 쿼리 문자열("?a=1&utm_source=x") 또는 서버 searchParams에서 utm_ 조각을 받은 순서대로 꺼낸다 */
function utmPieces(search: string | RawParams): string[] {
  if (typeof search === "string") return search.replace(/^\?/, "").split("&").filter(isUtm);
  return Object.entries(search).flatMap(([k, v]) =>
    isUtm(k) && v !== undefined ? (Array.isArray(v) ? v : [v]).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`) : [],
  );
}

/** 주소("/경로?쿼리")에서 utm_ 조각을 뺀다. 남은 쿼리가 없으면 경로만 */
function stripUtm(url: string): string {
  const i = url.indexOf("?");
  if (i < 0) return url;
  const rest = url
    .slice(i + 1)
    .split("&")
    .filter((p) => p !== "" && !isUtm(p));
  return rest.length > 0 ? `${url.slice(0, i)}?${rest.join("&")}` : url.slice(0, i);
}

/** 앱이 정한 주소(next) 뒤에 search의 utm_ 쿼리를 받은 순서대로 붙인다. search에 UTM이 없으면 next 그대로 */
export function withUtm(next: string, search: string | RawParams): string {
  const utm = utmPieces(search);
  if (utm.length === 0) return next;
  const base = stripUtm(next);
  return `${base}${base.includes("?") ? "&" : "?"}${utm.join("&")}`;
}

/**
 * 도착 주소를 앱 주소(next)로 정리할 때 replaceState에 넘길 주소. 지금 주소의 UTM을 뒤에 보존한다.
 * 바꿀 필요가 없으면 null이다. UTM이 있으면 UTM을 빼고 비교해, 앱 쿼리가 같으면 주소를 그대로 둔다
 * (주소를 바꾸면 GA4가 page_view를 한 번 더 보낸다).
 */
export function tidyUrl(next: string, loc: { pathname: string; search: string }): string | null {
  const now = `${loc.pathname}${loc.search}`;
  if (utmPieces(loc.search).length === 0) return now === next ? null : next;
  return stripUtm(now) === stripUtm(next) ? null : withUtm(next, loc.search);
}
