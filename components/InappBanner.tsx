"use client";

import { useEffect, useState } from "react";
import { type InappInfo, detectInapp, openExternalHref } from "@/lib/inapp";
import { copyText } from "@/components/visits/clipboard";
import { INAPP_BANNER_TEXT } from "@/lib/site";

type State = { info: NonNullable<InappInfo>; href: string | null };

/** 인앱 브라우저 안내: 상단에 붙는 얇은 먹색 띠. 문구는 대회 규칙 원문 그대로. */
export function InappBanner() {
  const [state, setState] = useState<State | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  useEffect(() => {
    const info = detectInapp(navigator.userAgent);
    if (!info) return;
    // UA는 브라우저에서만 읽을 수 있다. 마운트 뒤 한 번 판정한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ info, href: openExternalHref(info, window.location.href) });
  }, []);

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
  const { info, href } = state;
  const menuHint = "오른쪽 위 또는 아래 더보기 메뉴에서 기본 브라우저(Safari/Chrome)로 열어주세요.";
  const copyLabel = copyState === "ok" ? "링크를 복사했습니다" : copyState === "error" ? "링크 복사 실패" : "링크 복사";
  const copyCurrent = async () => {
    const url = window.location.href;
    const ok = await copyText(url);
    setCopyState(ok ? "ok" : "error");
    setManualUrl(ok ? null : url);
  };

  return (
    <div className="inapp" role="region" aria-label="외부 브라우저 안내">
      <div className="container inapp__row">
        <div className="inapp__msg">
          <p className="inapp__text">{INAPP_BANNER_TEXT}</p>
          <p className="inapp__hint">{href ? `직접 열리지 않으면 ${menuHint}` : menuHint}</p>
        </div>
        <div className="inapp__actions">
          {href ? (
            <a
              className="inapp__btn"
              href={href}
              onClick={(event) => {
                const nextHref = openExternalHref(info, window.location.href);
                if (nextHref) event.currentTarget.href = nextHref;
              }}
            >
              {info.kind === "kakaotalk" ? "브라우저로 열기" : "Chrome으로 열기"}
            </a>
          ) : null}
          <button type="button" className="inapp__copy" onClick={copyCurrent} aria-live="polite">
            {copyLabel}
          </button>
        </div>
      </div>
      {manualUrl ? (
        <div className="container inapp__manual">
          <textarea
            className="inapp__url"
            aria-label="현재 페이지 주소"
            value={manualUrl}
            rows={2}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}
