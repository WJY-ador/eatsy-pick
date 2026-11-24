"use client";

import { useEffect, useRef, useState } from "react";
import {
  type ExternalOpen,
  type InappInfo,
  detectInapp,
  externalOpen,
  menuGuide,
  needsCover,
  stripLineParam,
} from "@/lib/inapp";
import { copyText } from "@/components/visits/clipboard";
import { INAPP_BANNER_TEXT } from "@/lib/site";

type State = { info: NonNullable<InappInfo>; ext: ExternalOpen | null };

// 한 문서에서 자동 외부 열기는 한 번만 시도한다(띠가 다시 마운트돼도 반복하지 않는다).
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

/** 인앱 브라우저 안내: 상단에 붙는 얇은 먹색 띠. 문구는 대회 규칙 원문 그대로. */
export function InappBanner() {
  const [state, setState] = useState<State | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  // iOS 기타 인앱의 덮는 안내. 닫으면 얇은 띠만 남고, 페이지를 다시 열면 또 보인다(저장하지 않는다).
  const [coverOpen, setCoverOpen] = useState(false);
  const coverRef = useRef<HTMLDivElement>(null);
  // LINE 외부 열기 쿼리를 달고 들어온 경우(LINE이 가로채지 않았거나 외부 브라우저에 도착)
  const arrivedWithLineParam = useRef(false);

  useEffect(() => {
    // LINE 외부 열기 쿼리는 공유 주소에 남지 않게 지운다. 서버 렌더와 canonical은 쿼리와 무관하다.
    const stripped = stripLineParam(window.location.href);
    if (stripped) {
      arrivedWithLineParam.current = true;
      window.history.replaceState(null, "", stripped);
    }
    const info = detectInapp(navigator.userAgent);
    if (!info) return;
    // UA는 브라우저에서만 읽을 수 있다. 마운트 뒤 한 번 판정한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ info, ext: externalOpen(info, window.location.href) });
    setCoverOpen(needsCover(info));
  }, []);

  // 덮는 안내가 열려 있는 동안 뒤 화면 스크롤을 막고 초점을 안내로 옮긴다. Esc로 닫는다.
  useEffect(() => {
    if (!coverOpen) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    coverRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCoverOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [coverOpen]);

  // 띠를 먼저 그린 뒤 외부 브라우저로 자동 이동한다. 실패해도 띠와 버튼이 남는다.
  useEffect(() => {
    if (!state?.ext?.auto || autoTriedInDocument) return;
    // 외부 열기 쿼리를 달고 인앱으로 다시 들어왔다면 LINE이 가로채지 않은 것이다. 같은 이동을 반복하지 않는다.
    if (arrivedWithLineParam.current) return;
    // 자동화 브라우저(headless 시험, 렌더링 크롤러)는 자동 이동하지 않는다. 앱 스킴 이동이 첫 입력을 삼켜 시험을 흔든다.
    if (navigator.webdriver) return;
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (autoTriedInDocument) return;
        const auto = externalOpen(state.info, window.location.href)?.auto;
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
  }, [state]);

  // 컨트롤 바가 배너 바로 아래에 붙도록 배너 높이를 CSS 변수로 넘긴다.
  useEffect(() => {
    if (!state) return;
    const el = document.querySelector<HTMLElement>(".inapp");
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--banner-height", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--banner-height");
    };
  }, [state]);

  if (!state) return null;
  const { info, ext } = state;
  const menuHint = "오른쪽 위 또는 아래 더보기 메뉴에서 기본 브라우저(Safari/Chrome)로 열어주세요.";
  const copyLabel = copyState === "ok" ? "링크를 복사했습니다" : copyState === "error" ? "링크 복사 실패" : "링크 복사";
  const copyCurrent = async () => {
    const url = window.location.href;
    const ok = await copyText(url);
    setCopyState(ok ? "ok" : "error");
    setManualUrl(ok ? null : url);
  };

  const openButton = ext ? (
    <a
      className="inapp__btn"
      href={ext.href}
      onClick={(event) => {
        const next = externalOpen(info, window.location.href);
        if (next) event.currentTarget.href = next.href;
      }}
    >
      {ext.label}
    </a>
  ) : null;
  const copyButton = (
    <button type="button" className="inapp__copy" onClick={copyCurrent} aria-live="polite">
      {copyLabel}
    </button>
  );
  const manualField = manualUrl ? (
    <textarea
      className="inapp__url"
      aria-label="현재 페이지 주소"
      value={manualUrl}
      rows={2}
      readOnly
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.currentTarget.select()}
    />
  ) : null;

  return (
    <div className="inapp" role="region" aria-label="외부 브라우저 안내">
      <div className="container inapp__row">
        <div className="inapp__msg">
          <p className="inapp__text">{INAPP_BANNER_TEXT}</p>
          <p className="inapp__hint">{ext ? `직접 열리지 않으면 ${menuHint}` : menuHint}</p>
        </div>
        <div className="inapp__actions">
          {openButton}
          {copyButton}
        </div>
      </div>
      {manualField && !coverOpen ? <div className="container inapp__manual">{manualField}</div> : null}
      {coverOpen ? (
        <div className="inapp__cover" role="dialog" aria-modal="true" aria-labelledby="inapp-cover-title">
          <div className="inapp__sheet" ref={coverRef} tabIndex={-1}>
            <p id="inapp-cover-title" className="inapp__cover-title">
              {INAPP_BANNER_TEXT}
            </p>
            <p className="inapp__cover-guide">{menuGuide(info)}</p>
            <div className="inapp__cover-actions">
              {openButton}
              {copyButton}
            </div>
            {manualField}
            <button type="button" className="inapp__cover-close" onClick={() => setCoverOpen(false)}>
              닫고 이 화면에서 보기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
