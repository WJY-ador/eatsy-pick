// 인앱 브라우저 판정. 순수 함수로 둬서 UA 문자열로 바로 시험한다.

export type InappKind = "kakaotalk" | "threads" | "instagram" | "facebook" | "naver" | "line";
export type Os = "ios" | "android" | "other";
/** iosMajor는 iOS일 때 주 버전(예: 17), 그 밖은 null */
export type InappInfo = { kind: InappKind; os: Os; iosMajor: number | null } | null;

/**
 * 자동 시도 방식.
 * - assign: 현재 문서에서 location.assign. 앱 스킴이 처리되면 페이지는 그대로 남는다.
 *   iOS WKWebView는 처리 못 한 스킴 이동을 임시 이동 실패로 끝내 현재 문서를 바꾸지 않는다.
 * - replace: 같은 https 주소로 location.replace(LINE 쿼리).
 * - iframe: 숨긴 iframe에 intent 주소를 넣는다. 안드로이드 WebView는 처리 못 한 스킴을 오류 화면으로 바꾸는데,
 *   iframe이면 그 오류가 iframe 안에만 남아 우리 페이지가 바뀌지 않는다.
 */
export type AutoOpen = { href: string; navigate: "assign" | "replace" | "iframe" };

/** LINE 외부 브라우저 열기 쿼리(LINE Developers 문서). 도착 뒤 주소에서 지운다. */
export const LINE_EXTERNAL_PARAM = "openExternalBrowser";

// 검색 로봇과 링크 미리보기 수집기. 카카오 스크랩 UA에는 kakaotalk-scrap이 들어 있어
// KAKAOTALK 판정에 걸리므로 판정 맨 앞에서 거른다. 네이버 Yeti UA에는 naver.me가 들어 있다.
const BOT_RE =
  /googlebot|google-inspectiontool|adsbot-google|mediapartners-google|bingbot|bingpreview|applebot|duckduckbot|yandexbot|baiduspider|slurp|crawler|spider|kakaotalk-scrap|facebookexternalhit|facebookcatalog|facebot|meta-externalagent|yeti\/|daumoa|blueno|ads-naver|slackbot|discordbot|twitterbot|linkedinbot|telegrambot|whatsapp\/|skypeuripreview|chrome-lighthouse/i;

export function isBot(ua: string): boolean {
  return BOT_RE.test(ua);
}

export function osOf(ua: string): Os {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function iosMajorOf(ua: string): number | null {
  const m = /\bOS (\d+)[_.]\d+/.exec(ua);
  return m ? Number(m[1]) : null;
}

/** 인앱 브라우저면 종류와 OS, 아니면 null. 로봇은 null */
export function detectInapp(ua: string | null | undefined): InappInfo {
  if (!ua || isBot(ua)) return null;
  let kind: InappKind | null = null;
  if (/KAKAOTALK/i.test(ua)) kind = "kakaotalk";
  // Threads는 Barcelona 토큰으로 알려져 있다. 확신이 없어 Threads 문자열도 본다.
  else if (/Barcelona|Threads/i.test(ua)) kind = "threads";
  else if (/Instagram/i.test(ua)) kind = "instagram";
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) kind = "facebook";
  else if (/\bNAVER\b/i.test(ua)) kind = "naver";
  else if (/\bLine\//i.test(ua)) kind = "line";
  if (!kind) return null;
  const os = osOf(ua);
  return { kind, os, iosMajor: os === "ios" ? iosMajorOf(ua) : null };
}

function chromeIntent(currentUrl: string): string {
  const u = new URL(currentUrl);
  // intent 주소의 #은 Intent 구획 시작이다. 페이지 해시(#res-h)는 붙이지 않는다.
  const rest = `${u.host}${u.pathname}${u.search}`;
  const scheme = u.protocol.replace(":", "");
  return `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}

/**
 * 첫 진입 때 우리 페이지를 외부 브라우저로 한 번 자동으로 다시 여는 방법. 없으면 null(아무것도 하지 않는다).
 * 화면에는 아무것도 그리지 않는다. 이동이 실패하면 우리 페이지를 그대로 보여 준다.
 * - 카카오톡: kakaotalk://web/openExternal?url= (iOS, 안드로이드).
 * - LINE: 주소에 openExternalBrowser=1 (LINE Developers 문서).
 * - 안드로이드 기타: 숨긴 iframe에 Chrome intent.
 *   package를 빼면 기본 브라우저가 네이버 앱일 때 인앱으로 되돌아올 수 있어 Chrome으로 고정한다.
 * - iOS 17 이상 기타: x-safari-https://.
 *   Meta 웹뷰는 스크립트 이동을 무시한다는 보고가 있다. 실패해도 페이지가 바뀌지 않는다.
 * - iOS 16 이하 기타: 시도하지 않는다.
 * 자동 시도는 휴대폰(iOS, 안드로이드)에서만 한다.
 */
export function autoOpen(info: NonNullable<InappInfo>, currentUrl: string): AutoOpen | null {
  if (info.os === "other") return null;
  if (info.kind === "kakaotalk") {
    return { href: `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`, navigate: "assign" };
  }
  if (info.kind === "line") {
    const u = new URL(currentUrl);
    u.searchParams.set(LINE_EXTERNAL_PARAM, "1");
    return { href: u.toString(), navigate: "replace" };
  }
  if (info.os === "android") return { href: chromeIntent(currentUrl), navigate: "iframe" };
  if (info.iosMajor !== null && info.iosMajor >= 17 && /^https?:\/\//.test(currentUrl)) {
    return { href: `x-safari-${currentUrl}`, navigate: "assign" };
  }
  return null;
}

/** 주소에서 LINE 외부 열기 쿼리를 뺀 주소. 없으면 null */
export function stripLineParam(currentUrl: string): string | null {
  const u = new URL(currentUrl);
  if (!u.searchParams.has(LINE_EXTERNAL_PARAM)) return null;
  u.searchParams.delete(LINE_EXTERNAL_PARAM);
  return u.toString();
}
