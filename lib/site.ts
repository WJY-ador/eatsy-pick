// 서비스 이름, 대회 의무 문자열, 사이트 URL을 한 곳에 둔다.
// 의무 문자열 네 개는 대회 규칙 원문이다. 가운뎃점과 화살표를 고치지 않는다.

export const SITE_NAME = "eatsy pick";
export const SITE_DESCRIPTION =
  "내 주변 가게를 BC카드 결제 데이터로 고르고, 다녀온 곳의 반응을 다음 약속에 다시 씁니다. 로그인 없이 바로 씁니다.";
/** 공유 카드 일반 문구 */
export const SITE_TAGLINE = "내 주변에서 고르고, 다음 약속에 다시 쓰는 결제 데이터 지도";
/** 내 주변 위치 안내 */
export const GEO_NOTICE = "위치는 동네 이름을 찾는 데만 씁니다. 약 100m 단위로 줄인 좌표가 OpenStreetMap으로 전송됩니다.";
/** 내 주변 위치 안내(Nominatim을 끈 배포) */
export const GEO_NOTICE_LOCAL = "위치는 가까운 상권을 고르는 데만 쓰고 기기 밖으로 보내지 않습니다.";

/** 잇플 링크 문구 (규칙 1, 사용자가 2026-11-23 새로 준 원문) */
export const MER_LINK_TEXT = "실시간 붐빔 · 메뉴 확인하기 ↗";
/** 인앱 브라우저 안내 배너 문구 (규칙 3 원문) */
export const INAPP_BANNER_TEXT = "집계·원활한 이동을 위해 Safari/Chrome으로 열어주세요";
/** 의무 표기 첫 줄: 푸터와 카드마다 (규칙 4 원문) */
export const ATTRIBUTION = "eat.pl 잇플 · BC카드 결제 데이터 기반";
/** 의무 표기 둘째 줄: 푸터 (규칙 4 원문) */
export const DISCLAIMER = "맛·추천 순위가 아닌 카드 결제 데이터 기반 정보입니다.";
/** 푸터의 데이터 출처 한 줄 */
export const DATA_SOURCE =
  "데이터 출처: BC카드 잇플(eat.pl) 가맹점 결제 데이터, k-skill 프록시로 조회합니다.";

/** merUrl은 https://로 시작할 때만 링크로 그린다. 값은 바꾸지 않는다. */
export function isLinkableMerUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("https://");
}

/** 배포 도메인(Vercel 무료 주소, 2026-11-23 확정) */
export const PRODUCTION_URL = "https://eatsy-pick.vercel.app";


/**
 * metadataBase와 sitemap의 기준 URL.
 * NEXT_PUBLIC_SITE_URL이 있으면 그 값, 없고 프로덕션 빌드(VERCEL_ENV=production 또는 VERCEL_PROJECT_PRODUCTION_URL 있음)면
 * PRODUCTION_URL, 그 밖(로컬)은 localhost.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(PRODUCTION_URL);
  return new URL("http://localhost:3000");
}
