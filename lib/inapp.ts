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

/** 외부 브라우저로 다시 여는 방법 */
export type ExternalOpen = {
  /** 버튼 주소. 사용자가 누를 때 쓴다 */
  href: string;
  label: string;
  /** 첫 진입 때 자동 시도. 없으면 버튼만 */
  auto: AutoOpen | null;
};

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

function chromeIntent(currentUrl: string, fallback: boolean): string {
  const u = new URL(currentUrl);
  // intent 주소의 #은 Intent 구획 시작이다. 페이지 해시(#res-h)는 붙이지 않는다.
  const rest = `${u.host}${u.pathname}${u.search}`;
  const scheme = u.protocol.replace(":", "");
  // Chrome이 없어 intent가 풀리지 않을 때, 이 값을 처리하는 앱은 현재 주소를 다시 연다(Chrome 문서의 S.browser_fallback_url).
  const fb = fallback ? `S.browser_fallback_url=${encodeURIComponent(currentUrl)};` : "";
  return `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;${fb}end`;
}

/**
 * 우리 페이지를 외부 브라우저로 다시 여는 방법. 없으면 null(문장으로 안내).
 * - 카카오톡: kakaotalk://web/openExternal?url= (iOS, 안드로이드). 자동.
 * - LINE: 주소에 openExternalBrowser=1 (LINE Developers 문서). 자동.
 * - 안드로이드 기타: Chrome intent. 자동은 숨긴 iframe으로, 버튼은 현재 문서 이동으로.
 *   package를 빼면 기본 브라우저가 네이버 앱일 때 인앱으로 되돌아올 수 있어 Chrome으로 고정한다.
 * - iOS 17 이상 기타: x-safari-https://. 자동 한 번, 버튼도 같은 주소.
 *   Meta 웹뷰는 스크립트 이동을 무시한다는 보고가 있다. 실패해도 페이지가 바뀌지 않고, 덮는 안내가 남는다.
 * - iOS 16 이하 기타: 덮는 안내만.
 * 자동 시도는 휴대폰(iOS, 안드로이드)에서만 한다.
 */
export function externalOpen(info: NonNullable<InappInfo>, currentUrl: string): ExternalOpen | null {
  const mobile = info.os !== "other";
  if (info.kind === "kakaotalk") {
    const href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
    return { href, label: "브라우저로 열기", auto: mobile ? { href, navigate: "assign" } : null };
  }
  if (info.kind === "line") {
    const u = new URL(currentUrl);
    u.searchParams.set(LINE_EXTERNAL_PARAM, "1");
    const href = u.toString();
    return { href, label: "브라우저로 열기", auto: mobile ? { href, navigate: "replace" } : null };
  }
  if (info.os === "android") {
    return {
      href: chromeIntent(currentUrl, true),
      label: "Chrome으로 열기",
      auto: { href: chromeIntent(currentUrl, false), navigate: "iframe" },
    };
  }
  if (info.os === "ios" && info.iosMajor !== null && info.iosMajor >= 17 && /^https?:\/\//.test(currentUrl)) {
    const href = `x-safari-${currentUrl}`;
    return { href, label: "Safari로 열기", auto: { href, navigate: "assign" } };
  }
  return null;
}

/** iOS에서 강제 전환이 안 될 수 있는 앱은 화면을 덮는 안내를 띄운다 */
export function needsCover(info: NonNullable<InappInfo>): boolean {
  return info.os === "ios" && info.kind !== "kakaotalk" && info.kind !== "line";
}

/** 그 앱에서 외부 브라우저로 여는 메뉴 위치 */
export function menuGuide(info: NonNullable<InappInfo>): string {
  switch (info.kind) {
    case "instagram":
    case "threads":
    case "facebook":
      return "오른쪽 위 점 세 개(⋯) 메뉴에서 외부 브라우저로 열기를 누르세요.";
    case "naver":
      return "아래쪽 점 세 개(⋯) 메뉴에서 다른 브라우저로 열기를 누르세요.";
    case "kakaotalk":
      return "오른쪽 아래 점 세 개(⋯) 메뉴에서 다른 브라우저로 열기를 누르세요.";
    case "line":
      return "오른쪽 위 점 세 개(⋯) 메뉴에서 기본 브라우저로 열기를 누르세요.";
  }
}

/** 주소에서 LINE 외부 열기 쿼리를 뺀 주소. 없으면 null */
export function stripLineParam(currentUrl: string): string | null {
  const u = new URL(currentUrl);
  if (!u.searchParams.has(LINE_EXTERNAL_PARAM)) return null;
  u.searchParams.delete(LINE_EXTERNAL_PARAM);
  return u.toString();
}
