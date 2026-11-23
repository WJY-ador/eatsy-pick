// 인앱 브라우저 판정. 순수 함수로 둬서 UA 문자열로 바로 시험한다.

export type InappKind = "kakaotalk" | "threads" | "instagram" | "facebook" | "naver" | "line";
export type Os = "ios" | "android" | "other";
export type InappInfo = { kind: InappKind; os: Os } | null;

export function osOf(ua: string): Os {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** 인앱 브라우저면 종류와 OS, 아니면 null */
export function detectInapp(ua: string | null | undefined): InappInfo {
  if (!ua) return null;
  let kind: InappKind | null = null;
  if (/KAKAOTALK/i.test(ua)) kind = "kakaotalk";
  // Threads는 Barcelona 토큰으로 알려져 있다. 확신이 없어 Threads 문자열도 본다.
  else if (/Barcelona|Threads/.test(ua)) kind = "threads";
  else if (/Instagram/.test(ua)) kind = "instagram";
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) kind = "facebook";
  else if (/NAVER\(inapp/.test(ua)) kind = "naver";
  else if (/\bLine\//.test(ua)) kind = "line";
  return kind ? { kind, os: osOf(ua) } : null;
}

/** 우리 페이지를 외부 브라우저로 다시 여는 주소. 없으면 null(문장으로 안내) */
export function openExternalHref(info: NonNullable<InappInfo>, currentUrl: string): string | null {
  if (info.kind === "kakaotalk") return `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
  if (info.os === "android") {
    const u = new URL(currentUrl);
    // intent 주소의 #은 Intent 구획 시작이다. 페이지 해시(#res-h)는 붙이지 않는다.
    const rest = `${u.host}${u.pathname}${u.search}`;
    const scheme = u.protocol.replace(":", "");
    return `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }
  return null;
}
