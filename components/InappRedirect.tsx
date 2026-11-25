"use client";

import { useEffect, useRef } from "react";
import { autoOpen, detectInapp, stripLineParam } from "@/lib/inapp";

// 한 문서에서 자동 외부 열기는 한 번만 시도한다(다시 마운트돼도 반복하지 않는다).
// 페이지를 새로 열 때마다는 다시 시도한다. 카카오톡 스킴은 실패해도 페이지를 다시 읽지 않고,
// LINE은 외부 열기 쿼리를 달고 돌아오면 멈추므로 반복 재로드가 생기지 않는다.
// 안드로이드 intent는 숨긴 iframe으로 시도해 우리 페이지가 오류 화면으로 바뀌지 않게 한다.
let autoTriedInDocument = false;

function tryInFrame(href: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.display = "none";
  frame.src = href;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 3000);
}

/**
 * 인앱 브라우저에서 기본 브라우저로 한 번 자동으로 넘긴다. 화면에는 아무것도 그리지 않는다.
 * 자동 이동이 없거나 실패하면 우리 페이지를 그대로 보여 준다.
 */
export function InappRedirect() {
  // LINE 외부 열기 쿼리를 달고 들어온 경우(LINE이 가로채지 않았거나 외부 브라우저에 도착)
  const arrivedWithLineParam = useRef(false);

  useEffect(() => {
    // LINE 외부 열기 쿼리는 공유 주소에 남지 않게 지운다. 서버 렌더와 canonical은 쿼리와 무관하다.
    const stripped = stripLineParam(window.location.href);
    if (stripped) {
      arrivedWithLineParam.current = true;
      window.history.replaceState(null, "", stripped);
    }
    // UA는 브라우저에서만 읽을 수 있다. 마운트 뒤 한 번 판정한다.
    const info = detectInapp(navigator.userAgent);
    if (!info || !autoOpen(info, window.location.href) || autoTriedInDocument) return;
    // 외부 열기 쿼리를 달고 인앱으로 다시 들어왔다면 LINE이 가로채지 않은 것이다. 같은 이동을 반복하지 않는다.
    if (arrivedWithLineParam.current) return;
    // 자동화 브라우저(headless 시험, 렌더링 크롤러)는 자동 이동하지 않는다. 앱 스킴 이동이 첫 입력을 삼켜 시험을 흔든다.
    if (navigator.webdriver) return;
    // 첫 화면을 그린 뒤 이동한다. 주소는 이동 직전에 다시 읽는다(그사이 앱이 주소를 정리할 수 있다).
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (autoTriedInDocument) return;
        const auto = autoOpen(info, window.location.href);
        if (!auto) return;
        autoTriedInDocument = true;
        // 앱 스킴은 assign: 처리되면 페이지가 그대로 남는다. LINE은 같은 https 주소라 replace.
        // 안드로이드 intent는 iframe: 처리 못 하는 웹뷰여도 오류 화면이 iframe 안에만 생긴다.
        if (auto.navigate === "iframe") tryInFrame(auto.href);
        else if (auto.navigate === "replace") window.location.replace(auto.href);
        else window.location.assign(auto.href);
      }, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
