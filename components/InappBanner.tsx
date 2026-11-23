"use client";

import { useEffect, useState } from "react";
import { type InappInfo, detectInapp, openExternalHref } from "@/lib/inapp";
import { INAPP_BANNER_TEXT } from "@/lib/site";

type State = { info: NonNullable<InappInfo>; href: string | null };

/** 인앱 브라우저 안내: 상단에 붙는 얇은 먹색 띠. 문구는 대회 규칙 원문 그대로. */
export function InappBanner() {
  const [state, setState] = useState<State | null>(null);

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

  return (
    <div className="inapp" role="region" aria-label="외부 브라우저 안내">
      <div className="container inapp__row">
        <div className="inapp__msg">
          <p className="inapp__text">{INAPP_BANNER_TEXT}</p>
          {href ? null : <p className="inapp__hint">오른쪽 위 메뉴에서 외부 브라우저로 열기를 누르세요.</p>}
        </div>
        {href ? (
          <a className="inapp__btn" href={href}>
            {info.kind === "kakaotalk" ? "브라우저로 열기" : "Chrome으로 열기"}
          </a>
        ) : null}
      </div>
    </div>
  );
}
